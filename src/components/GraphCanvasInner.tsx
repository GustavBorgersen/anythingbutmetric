"use client";

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { ROUTE_COLOURS } from "@/lib/constants";
import type { Unit, Edge, HighlightState } from "@/lib/types";

interface GraphNode extends Unit {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
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
  // Track real pointer position for tooltip placement
  const pointerRef = useRef({ x: 0, y: 0 });

  // --- Debug: track which nodes actually reach the shadow canvas each cycle
  const dbgPaintedNodes = useRef(new Set<string>());
  const dbgPaintCalls = useRef(0);

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

  // --- Fix: smooth wheel zoom.
  // We disable d3-zoom's built-in wheel handler (enableZoomInteraction={false}) and
  // implement our own with delta normalisation so trackpad steps are not jumpy.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
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
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
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

  // Debug: every 5 s report how many distinct nodes reached the shadow canvas
  // vs how many are in graphData.  Open browser DevTools → Console to see this.
  useEffect(() => {
    const interval = setInterval(() => {
      const expected = graphData.nodes.length;
      const painted = dbgPaintedNodes.current.size;
      const calls = dbgPaintCalls.current;
      console.log(
        `[picking] graphData: ${expected} nodes | shadow painted: ${painted} unique nodes, ${calls} calls in last 5s`
      );
      if (painted > 0 && painted < expected) {
        const missing = graphData.nodes
          .filter((n) => !dbgPaintedNodes.current.has(n.id))
          .map((n) => n.id);
        console.warn("[picking] nodes NOT in shadow canvas:", missing);
      }
      dbgPaintedNodes.current.clear();
      dbgPaintCalls.current = 0;
    }, 5000);
    return () => clearInterval(interval);
  }, [graphData]);

  // Auto-zoom when highlights or missingLinkGroups change
  useEffect(() => {
    if (!graphRef.current) return;
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
    }, 300);
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

  // Explicit click area for each node — hit radius is kept at a fixed ~8px in
  // screen space regardless of zoom level (graph-space radius = 8 / globalScale).
  const nodePointerAreaPaint = useCallback(
    (node: object, color: string, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode & { x?: number; y?: number };
      // Debug: record every node that is passed to the shadow canvas painter
      dbgPaintCalls.current++;
      dbgPaintedNodes.current.add(n.id);
      // Guard: skip nodes that the simulation hasn't positioned yet
      if (n.x == null || n.y == null || isNaN(n.x) || isNaN(n.y)) {
        console.warn("[picking] node without position, skipped:", n.id);
        return;
      }
      const radius = 8 / globalScale;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI);
      ctx.fill();
    },
    []
  );

  // Explicit click area for each link — kept at ~8px screen-space width so
  // thin edges remain reliably clickable at any zoom level.
  const linkPointerAreaPaint = useCallback(
    (link: object, color: string, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const l = link as GraphLink;
      const src = typeof l.source === "object" ? (l.source as GraphNode) : null;
      const tgt = typeof l.target === "object" ? (l.target as GraphNode) : null;
      if (src?.x == null || src?.y == null || tgt?.x == null || tgt?.y == null) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 8 / globalScale;
      ctx.beginPath();
      ctx.moveTo(src.x as number, src.y as number);
      ctx.lineTo(tgt.x as number, tgt.y as number);
      ctx.stroke();
    },
    []
  );

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
      onPointerMove={(e) => {
        pointerRef.current = { x: e.clientX, y: e.clientY };
      }}
    >
      {dimensions.width > 0 && (
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          nodeId="id"
          nodeCanvasObject={nodeCanvasObject}
          nodeCanvasObjectMode={() => "replace"}
          nodePointerAreaPaint={nodePointerAreaPaint}
          linkPointerAreaPaint={linkPointerAreaPaint}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkDirectionalArrowLength={3}
          linkDirectionalArrowRelPos={1}
          backgroundColor="#09090b"
          width={dimensions.width}
          height={dimensions.height}
          enableZoomInteraction={false}
          autoPauseRedraw={false}
          warmupTicks={100}
          d3AlphaDecay={0.05}
          onNodeClick={(node) => {
            const n = node as GraphNode;
            console.log("[picking] node clicked:", n.id);
            setClickedNodeId((prev) => (prev === n.id ? null : n.id));
            setClickedEdgeInfo(null);
          }}
          onLinkClick={(link) => {
            const l = link as GraphLink;
            const src =
              typeof l.source === "object"
                ? (l.source as GraphNode).id
                : l.source;
            const tgt =
              typeof l.target === "object"
                ? (l.target as GraphNode).id
                : l.target;
            const allLinks = graphData.links.filter((gl) => {
              const gs =
                typeof gl.source === "object"
                  ? (gl.source as GraphNode).id
                  : gl.source;
              const gt =
                typeof gl.target === "object"
                  ? (gl.target as GraphNode).id
                  : gl.target;
              return (gs === src && gt === tgt) || (gs === tgt && gt === src);
            }) as GraphLink[];
            // Use tracked pointer position for reliable tooltip placement
            const px = pointerRef.current.x;
            const py = pointerRef.current.y;
            const TOOLTIP_W = 340;
            const TOOLTIP_H = 200;
            const x = Math.min(px + 12, window.innerWidth - TOOLTIP_W - 8);
            const y =
              py + 12 + TOOLTIP_H > window.innerHeight
                ? py - TOOLTIP_H - 8
                : py + 12;
            setClickedEdgeInfo({ links: allLinks, x, y });
            setClickedNodeId(null);
          }}
          onBackgroundClick={() => {
            setClickedNodeId(null);
            setClickedEdgeInfo(null);
          }}
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
