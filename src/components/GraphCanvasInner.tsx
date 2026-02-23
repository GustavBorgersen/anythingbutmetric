"use client";

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { ROUTE_COLOURS } from "@/lib/constants";
import type { Unit, Edge, HighlightState } from "@/lib/types";

// Perpendicular distance from point (px,py) to segment (ax,ay)→(bx,by)
function distToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

interface GraphNode extends Unit {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
}

interface GraphLink {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  factor: number;
  verified: boolean;
  source_url: string;
  source_quote: string;
}

interface EdgeTooltip {
  links: GraphLink[];
  x: number;
  y: number;
}

interface Props {
  units: Unit[];
  edges: Edge[];
  highlights: HighlightState[];
  missingLinkGroups?: [string[], string[]] | null;
}

export default function GraphCanvasInner({
  units,
  edges,
  highlights,
  missingLinkGroups,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const [clickedNodeId, setClickedNodeId] = useState<string | null>(null);
  const [clickedEdgeInfo, setClickedEdgeInfo] = useState<EdgeTooltip | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  // CSS-pixel positions of each node (updated every frame by nodeCanvasObject).
  // Used by our geometric hit-detection so we never call getImageData(), which
  // Brave's fingerprint-farbling randomises and breaks shadow-canvas picking.
  const nodeCSSPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  // Raw canvas transform stored each frame — lets us invert CSS→graph coords
  // for node dragging without relying on any library coordinate API.
  const canvasTransformRef = useRef<{ a: number; d: number; e: number; f: number } | null>(null);
  // Track pointer-down position to distinguish a tap/click from a drag.
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  // Currently dragged node (null when not dragging).
  const draggingNodeRef = useRef<{ node: GraphNode } | null>(null);
  // Stable ref to current graphData for use inside native event listeners.
  // Initialised empty; synced to graphData each render (see below).
  const graphDataRef = useRef<{ nodes: GraphNode[]; links: GraphLink[] }>({ nodes: [], links: [] });


  // --- Fix: track container size so ForceGraph2D gets correct canvas dimensions.
  // Without this, width/height are undefined on first render → canvas defaults to
  // 300×150px → click hit-testing is completely broken on large screens.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // --- Fix: smooth wheel zoom without breaking d3-zoom's picking internals.
  // We intercept wheel events in the CAPTURE phase (before d3-zoom's canvas
  // listener sees them) and stop propagation so d3-zoom's own wheel handler
  // never fires.  We then call graphRef.current.zoom() ourselves with a
  // normalised delta.  Crucially, enableZoomInteraction stays true so d3-zoom
  // keeps all its other event listeners (needed for shadow-canvas picking on PC).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation(); // stop d3-zoom's canvas listener from also firing
      if (!graphRef.current) return;
      // Normalise deltaMode differences then cap magnitude to avoid large single steps
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16; // lines → pixels
      if (e.deltaMode === 2) dy *= 400; // pages → pixels
      const capped = Math.sign(dy) * Math.min(Math.abs(dy), 50);
      const factor = Math.exp(-capped * 0.002);
      const cur = graphRef.current.zoom() as number;
      graphRef.current.zoom(Math.max(0.1, Math.min(10, cur * factor)), 0);
    };
    // capture: true fires our handler before the canvas (child) gets the event
    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => el.removeEventListener("wheel", onWheel, { capture: true });
  }, []);

  // Build highlighted sets for quick lookup
  const highlightedNodeIds = new Set<string>();
  const highlightedEdgeIds = new Set<string>();
  const edgeRouteIndex = new Map<string, number>();
  const nodeRouteIndex = new Map<string, number>();

  for (const h of highlights) {
    for (const nId of h.nodeIds) {
      highlightedNodeIds.add(nId);
      if (!nodeRouteIndex.has(nId)) nodeRouteIndex.set(nId, h.routeIndex);
    }
    for (const eId of h.edgeIds) {
      highlightedEdgeIds.add(eId);
      if (!edgeRouteIndex.has(eId)) edgeRouteIndex.set(eId, h.routeIndex);
    }
  }

  const hasRouteHighlight = highlightedNodeIds.size > 0;
  const hasLocalClick = clickedNodeId !== null;
  const hasMissingLink = !!missingLinkGroups && !hasRouteHighlight;

  // Memoised so ForceGraph2D gets a stable object reference as long as the
  // underlying data hasn't changed.  Recreating graphData on every render
  // (e.g. when clickedNodeId changes) causes the library to re-assign its
  // internal __indexColor picking registry → stale shadow canvas → broken drag.
  const graphData = useMemo(() => {
    const connectedIds = new Set(edges.flatMap((e) => [e.from, e.to]));
    return {
      nodes: units
        .filter((u) => connectedIds.has(u.id))
        .map((u) => ({ ...u })) as GraphNode[],
      links: edges.map((e) => ({
        id: e.id,
        source: e.from,
        target: e.to,
        factor: e.factor,
        verified: e.verified,
        source_url: e.source_url,
        source_quote: e.source_quote,
      })) as GraphLink[],
    };
  }, [units, edges]);
  // Keep ref in sync so native event listeners always see fresh graph data.
  graphDataRef.current = graphData;

  // Neighbour set for clicked node (uses stable edges prop)
  const neighborIds = useMemo(() => {
    if (!clickedNodeId) return new Set<string>();
    const neighbors = new Set<string>();
    for (const e of edges) {
      if (e.from === clickedNodeId) neighbors.add(e.to);
      if (e.to === clickedNodeId) neighbors.add(e.from);
    }
    return neighbors;
  }, [clickedNodeId, edges]);


  // Auto-zoom when highlights or missingLinkGroups change
  useEffect(() => {
    if (!graphRef.current) return;
    // 1 s delay on initial load lets the force simulation settle (d3AlphaDecay
    // 0.05 → ~60 ticks to cool) before we zoom to fit.  Highlight/missing-link
    // triggered zooms use a shorter window since layout is already stable.
    const delay = highlightedNodeIds.size > 0 || missingLinkGroups ? 300 : 1000;
    const timer = setTimeout(() => {
      if (!graphRef.current) return;
      if (highlightedNodeIds.size > 0) {
        graphRef.current.zoomToFit(400, 60, (n: GraphNode) =>
          highlightedNodeIds.has(n.id)
        );
      } else if (missingLinkGroups) {
        const bothIds = new Set([
          ...missingLinkGroups[0],
          ...missingLinkGroups[1],
        ]);
        graphRef.current.zoomToFit(400, 40, (n: GraphNode) =>
          bothIds.has(n.id)
        );
      } else {
        graphRef.current.zoomToFit(400, 40);
      }
    }, delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlights, missingLinkGroups]);

  // Missing link island sets
  const islandA = missingLinkGroups ? new Set(missingLinkGroups[0]) : null;
  const islandB = missingLinkGroups ? new Set(missingLinkGroups[1]) : null;

  const nodeCanvasObject = useCallback(
    (node: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode & { x: number; y: number };

      let colour: string;
      let radius: number;
      let alpha: number;
      let labelColour: string;

      if (hasMissingLink) {
        if (islandA?.has(n.id)) {
          colour = ROUTE_COLOURS[0];
          radius = 5;
          alpha = 1;
          labelColour = "#f9fafb";
        } else if (islandB?.has(n.id)) {
          colour = ROUTE_COLOURS[1];
          radius = 5;
          alpha = 1;
          labelColour = "#f9fafb";
        } else {
          colour = "#6b7280";
          radius = 4;
          alpha = 0.2;
          labelColour = "#9ca3af";
        }
      } else if (hasRouteHighlight && hasLocalClick) {
        const isRouteHighlighted = highlightedNodeIds.has(n.id);
        const isClicked = n.id === clickedNodeId;
        const isNeighbour = neighborIds.has(n.id);
        if (isRouteHighlighted) {
          const routeIdx = nodeRouteIndex.get(n.id) ?? 0;
          colour = ROUTE_COLOURS[routeIdx % ROUTE_COLOURS.length];
          radius = 6;
          alpha = 1;
          labelColour = "#f9fafb";
        } else if (isClicked) {
          colour = "#f9fafb";
          radius = 6;
          alpha = 1;
          labelColour = "#f9fafb";
        } else if (isNeighbour) {
          colour = "#9ca3af";
          radius = 5;
          alpha = 1;
          labelColour = "#9ca3af";
        } else {
          colour = "#6b7280";
          radius = 4;
          alpha = 0.15;
          labelColour = "#9ca3af";
        }
      } else if (hasRouteHighlight) {
        const isHighlighted = highlightedNodeIds.has(n.id);
        if (isHighlighted) {
          const routeIdx = nodeRouteIndex.get(n.id) ?? 0;
          colour = ROUTE_COLOURS[routeIdx % ROUTE_COLOURS.length];
          radius = 6;
          alpha = 1;
          labelColour = "#f9fafb";
        } else {
          colour = "#6b7280";
          radius = 4;
          alpha = 0.25;
          labelColour = "#9ca3af";
        }
      } else if (hasLocalClick) {
        const isClicked = n.id === clickedNodeId;
        const isNeighbour = neighborIds.has(n.id);
        if (isClicked) {
          colour = "#f9fafb";
          radius = 6;
          alpha = 1;
          labelColour = "#f9fafb";
        } else if (isNeighbour) {
          colour = "#9ca3af";
          radius = 5;
          alpha = 1;
          labelColour = "#9ca3af";
        } else {
          colour = "#6b7280";
          radius = 4;
          alpha = 0.25;
          labelColour = "#9ca3af";
        }
      } else {
        colour = "#6b7280";
        radius = 4;
        alpha = 1;
        labelColour = "#9ca3af";
      }

      // Record CSS-pixel position and raw transform for geometric picking + drag.
      const t = ctx.getTransform();
      const dpr = window.devicePixelRatio || 1;
      canvasTransformRef.current = { a: t.a, d: t.d, e: t.e, f: t.f };
      nodeCSSPositions.current.set(n.id, {
        x: (t.a * n.x + t.e) / dpr,
        y: (t.d * n.y + t.f) / dpr,
      });

      ctx.save();
      ctx.globalAlpha = alpha;

      ctx.beginPath();
      ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI, false);
      ctx.fillStyle = colour;
      ctx.fill();

      const label = (n.emoji ? n.emoji + " " : "") + n.label;
      const fontSize = Math.max(4, 10 / globalScale);
      ctx.font = `${fontSize}px sans-serif`;
      ctx.fillStyle = labelColour;
      ctx.textAlign = "center";
      ctx.fillText(label, n.x, n.y + radius + fontSize * 1.2);

      ctx.restore();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [highlights, clickedNodeId, neighborIds, missingLinkGroups]
  );

  // All pointer interaction — registered as native listeners so we can use
  // capture phase on pointerdown.  Capture phase fires BEFORE d3-zoom's canvas
  // listener, letting us call stopPropagation() when we're over a node so
  // d3-zoom never starts a conflicting pan while we drag the node.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // ---- helpers (close over stable refs only) ----
    function nodeAt(clientX: number, clientY: number): GraphNode | null {
      const rect = el!.querySelector("canvas")?.getBoundingClientRect();
      const cx = clientX - (rect?.left ?? 0);
      const cy = clientY - (rect?.top ?? 0);
      let best: GraphNode | null = null;
      let bestD = 12; // 12 CSS-px hit radius
      for (const [id, pos] of nodeCSSPositions.current) {
        const d = Math.hypot(cx - pos.x, cy - pos.y);
        if (d < bestD) {
          bestD = d;
          best = (graphDataRef.current.nodes.find((n) => n.id === id) ?? null) as GraphNode | null;
        }
      }
      return best;
    }

    function linkAt(clientX: number, clientY: number): GraphLink | null {
      const rect = el!.querySelector("canvas")?.getBoundingClientRect();
      const cx = clientX - (rect?.left ?? 0);
      const cy = clientY - (rect?.top ?? 0);
      let best: GraphLink | null = null;
      let bestD = 8; // 8 CSS-px hit radius from line
      for (const link of graphDataRef.current.links) {
        const srcId =
          typeof link.source === "object" ? (link.source as GraphNode).id : link.source;
        const tgtId =
          typeof link.target === "object" ? (link.target as GraphNode).id : link.target;
        const sp = nodeCSSPositions.current.get(srcId);
        const tp = nodeCSSPositions.current.get(tgtId);
        if (!sp || !tp) continue;
        const d = distToSegment(cx, cy, sp.x, sp.y, tp.x, tp.y);
        if (d < bestD) { bestD = d; best = link as GraphLink; }
      }
      return best;
    }

    // ---- pointer down (capture) ----
    function onPointerDown(e: PointerEvent) {
      pointerDownRef.current = { x: e.clientX, y: e.clientY };
      const node = nodeAt(e.clientX, e.clientY);
      if (node && node.x != null && node.y != null) {
        node.fx = node.x;
        node.fy = node.y;
        draggingNodeRef.current = { node };
        el!.setPointerCapture(e.pointerId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (graphRef.current as any)?.d3ReheatSimulation?.();
        // Stop d3-zoom from starting a pan at the same time
        e.stopPropagation();
      }
    }

    // ---- pointer move ----
    function onPointerMove(e: PointerEvent) {
      if (!draggingNodeRef.current) return;
      const { node } = draggingNodeRef.current;
      const t = canvasTransformRef.current;
      if (!t || t.a === 0) return;
      const rect = el!.querySelector("canvas")?.getBoundingClientRect();
      const cssX = e.clientX - (rect?.left ?? 0);
      const cssY = e.clientY - (rect?.top ?? 0);
      const dpr = window.devicePixelRatio || 1;
      // Invert the canvas transform: graph = (canvasPx - translate) / scale
      node.fx = (cssX * dpr - t.e) / t.a;
      node.fy = (cssY * dpr - t.f) / t.d;
    }

    // ---- pointer up ----
    function onPointerUp(e: PointerEvent) {
      const down = pointerDownRef.current;

      // End node drag
      if (draggingNodeRef.current) {
        const { node } = draggingNodeRef.current;
        node.fx = undefined;
        node.fy = undefined;
        draggingNodeRef.current = null;
        // Treat as click only if the pointer barely moved
        if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      }

      // Click / tap handling
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;

      const hitNode = nodeAt(e.clientX, e.clientY);
      if (hitNode) {
        setClickedNodeId((prev) => (prev === hitNode.id ? null : hitNode.id));
        setClickedEdgeInfo(null);
        return;
      }

      const hitLink = linkAt(e.clientX, e.clientY);
      if (hitLink) {
        const src =
          typeof hitLink.source === "object"
            ? (hitLink.source as GraphNode).id
            : hitLink.source;
        const tgt =
          typeof hitLink.target === "object"
            ? (hitLink.target as GraphNode).id
            : hitLink.target;
        const allLinks = graphDataRef.current.links.filter((gl) => {
          const gs =
            typeof gl.source === "object" ? (gl.source as GraphNode).id : gl.source;
          const gt =
            typeof gl.target === "object" ? (gl.target as GraphNode).id : gl.target;
          return (gs === src && gt === tgt) || (gs === tgt && gt === src);
        }) as GraphLink[];
        const TOOLTIP_W = 340;
        const TOOLTIP_H = 200;
        const x = Math.min(e.clientX + 12, window.innerWidth - TOOLTIP_W - 8);
        const y =
          e.clientY + 12 + TOOLTIP_H > window.innerHeight
            ? e.clientY - TOOLTIP_H - 8
            : e.clientY + 12;
        setClickedEdgeInfo({ links: allLinks, x, y });
        setClickedNodeId(null);
        return;
      }

      setClickedNodeId(null);
      setClickedEdgeInfo(null);
    }

    // capture:true → fires before d3-zoom's canvas listener
    el.addEventListener("pointerdown", onPointerDown, { capture: true });
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown, { capture: true });
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // stable: all mutable state accessed via refs; setters are stable

  const linkColor = useCallback(
    (link: object) => {
      const l = link as GraphLink;
      const isHighlighted = highlightedEdgeIds.has(l.id);

      if (hasMissingLink) return "rgba(107,114,128,0.2)";

      const src =
        typeof l.source === "object" ? (l.source as GraphNode).id : l.source;
      const tgt =
        typeof l.target === "object" ? (l.target as GraphNode).id : l.target;

      if (hasRouteHighlight) {
        if (isHighlighted) {
          const routeIdx = edgeRouteIndex.get(l.id) ?? 0;
          return ROUTE_COLOURS[routeIdx % ROUTE_COLOURS.length];
        }
        return "rgba(107,114,128,0.25)";
      }

      if (hasLocalClick) {
        if (src === clickedNodeId || tgt === clickedNodeId) return "#9ca3af";
        return "rgba(107,114,128,0.25)";
      }

      return l.verified ? "#4b5563" : "#374151";
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [highlights, clickedNodeId, missingLinkGroups]
  );

  const linkWidth = useCallback(
    (link: object) => {
      const l = link as GraphLink;
      if (highlightedEdgeIds.has(l.id)) return 2.5;

      if (hasLocalClick) {
        const src =
          typeof l.source === "object" ? (l.source as GraphNode).id : l.source;
        const tgt =
          typeof l.target === "object" ? (l.target as GraphNode).id : l.target;
        if (src === clickedNodeId || tgt === clickedNodeId) return 2;
      }

      return 1.5;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [highlights, clickedNodeId]
  );

  return (
    <div
      ref={containerRef}
      className="w-full h-full touch-none relative"
    >
      {dimensions.width > 0 && (
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          nodeId="id"
          nodeCanvasObject={nodeCanvasObject}
          nodeCanvasObjectMode={() => "replace"}
          enableNodeDrag={false}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkDirectionalArrowLength={3}
          linkDirectionalArrowRelPos={1}
          backgroundColor="#09090b"
          width={dimensions.width}
          height={dimensions.height}
          autoPauseRedraw={false}
          d3AlphaDecay={0.05}
        />
      )}

      {/* Edge tooltip */}
      {clickedEdgeInfo && (
        <div
          className="fixed z-50 max-w-xs rounded-lg border border-zinc-600 bg-zinc-900 p-3 shadow-xl text-sm"
          style={{ left: clickedEdgeInfo.x, top: clickedEdgeInfo.y }}
        >
          <button
            className="absolute top-2 right-2 text-zinc-400 hover:text-zinc-100 text-xs leading-none"
            onClick={() => setClickedEdgeInfo(null)}
          >
            ✕
          </button>
          <div className="space-y-3 pr-4">
            {clickedEdgeInfo.links.map((l, i) => (
              <div key={i}>
                {l.source_quote && (
                  <p className="text-zinc-300 italic mb-1">
                    &ldquo;{l.source_quote}&rdquo;
                  </p>
                )}
                <a
                  href={l.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline break-all text-xs"
                >
                  {l.source_url}
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
