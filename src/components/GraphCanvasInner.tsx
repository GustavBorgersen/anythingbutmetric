"use client";

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { ROUTE_COLOURS } from "@/lib/constants";
import type { Unit, Edge, HighlightState } from "@/lib/types";

// Detect Brave Shields (or any fingerprint-farbling extension) by checking
// whether canvas getImageData() returns the exact pixel values we drew.
// Without farbling all 16 pixels match; with ±1 Brave noise ~0–1 match by chance.
function detectCanvasFarbling(): boolean {
  try {
    const c = document.createElement("canvas");
    c.width = 16; c.height = 1;
    const ctx = c.getContext("2d");
    if (!ctx) return false;
    ctx.fillStyle = "rgb(100, 149, 237)"; // known exact values
    ctx.fillRect(0, 0, 16, 1);
    const d = ctx.getImageData(0, 0, 16, 1).data;
    let matches = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] === 100 && d[i + 1] === 149 && d[i + 2] === 237 && d[i + 3] === 255)
        matches++;
    }
    return matches < 8;
  } catch {
    return false;
  }
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
  const [shieldWarning, setShieldWarning] = useState(false);

  // Detect canvas farbling once on mount
  useEffect(() => {
    if (detectCanvasFarbling()) setShieldWarning(true);
  }, []);

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

  // --- Prevent page scroll on wheel; d3-zoom handles the actual zoom itself.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => e.preventDefault();
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
  // underlying data hasn't changed.
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
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkDirectionalArrowLength={3}
          linkDirectionalArrowRelPos={1}
          backgroundColor="#09090b"
          width={dimensions.width}
          height={dimensions.height}
          autoPauseRedraw={false}
          d3AlphaDecay={0.05}
          onNodeClick={(node) => {
            setClickedNodeId((prev) => prev === (node as GraphNode).id ? null : (node as GraphNode).id);
            setClickedEdgeInfo(null);
          }}
          onBackgroundClick={() => { setClickedNodeId(null); setClickedEdgeInfo(null); }}
          onLinkClick={(link, event) => {
            const l = link as GraphLink;
            const src = typeof l.source === "object" ? (l.source as GraphNode).id : l.source;
            const tgt = typeof l.target === "object" ? (l.target as GraphNode).id : l.target;
            const allLinks = graphData.links.filter((gl) => {
              const gs = typeof gl.source === "object" ? (gl.source as GraphNode).id : gl.source;
              const gt = typeof gl.target === "object" ? (gl.target as GraphNode).id : gl.target;
              return (gs === src && gt === tgt) || (gs === tgt && gt === src);
            }) as GraphLink[];
            const TOOLTIP_W = 340, TOOLTIP_H = 200;
            const x = Math.min(event.clientX + 12, window.innerWidth - TOOLTIP_W - 8);
            const y = event.clientY + 12 + TOOLTIP_H > window.innerHeight
              ? event.clientY - TOOLTIP_H - 8 : event.clientY + 12;
            setClickedEdgeInfo({ links: allLinks, x, y });
            setClickedNodeId(null);
          }}
        />
      )}

      {/* Brave Shields / canvas-farbling warning */}
      {shieldWarning && (
        <div className="absolute top-3 right-3 z-20 max-w-xs rounded-lg border border-amber-700 bg-amber-950/90 p-3 text-xs text-amber-200 shadow-xl">
          <button
            className="absolute top-2 right-2 text-amber-400 hover:text-amber-100 leading-none"
            onClick={() => setShieldWarning(false)}
          >✕</button>
          <div className="font-semibold text-amber-400 mb-1">Browser shield active</div>
          <p>
            A fingerprint-protection shield (e.g. Brave Shields) is randomising canvas
            pixel data, which breaks node and edge interaction on the graph.
            Disable the shield for this site to restore full interactivity.
          </p>
        </div>
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
