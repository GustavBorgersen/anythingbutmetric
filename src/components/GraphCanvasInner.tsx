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

  // Fix 1: Prevent browser scroll from consuming wheel events before d3-zoom sees them
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => e.preventDefault();
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

  // Remap edges: from/to → source/target (react-force-graph-2d requirement)
  const connectedIds = new Set(edges.flatMap((e) => [e.from, e.to]));
  const graphData = {
    nodes: units.filter((u) => connectedIds.has(u.id)).map((u) => ({ ...u })) as GraphNode[],
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

  // Build neighbour set for clicked node (use edges prop directly for stability)
  const neighborIds = useMemo(() => {
    if (!clickedNodeId) return new Set<string>();
    const neighbors = new Set<string>();
    for (const e of edges) {
      if (e.from === clickedNodeId) neighbors.add(e.to);
      if (e.to === clickedNodeId) neighbors.add(e.from);
    }
    return neighbors;
  }, [clickedNodeId, edges]);

  // Auto-zoom-to-fit when highlights change
  useEffect(() => {
    if (!graphRef.current) return;
    if (highlightedNodeIds.size > 0) {
      setTimeout(() => {
        graphRef.current.zoomToFit(400, 60, (node: GraphNode) =>
          highlightedNodeIds.has(node.id)
        );
      }, 300);
    } else {
      setTimeout(() => graphRef.current.zoomToFit(400, 40), 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlights]);

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
        if (src === clickedNodeId || tgt === clickedNodeId) return 1.5;
      }

      return 1;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [highlights, clickedNodeId]
  );

  return (
    <div ref={containerRef} className="w-full h-full touch-none relative">
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
        width={containerRef.current?.clientWidth}
        height={containerRef.current?.clientHeight}
        onNodeClick={(node) => {
          const n = node as GraphNode;
          setClickedNodeId((prev) => (prev === n.id ? null : n.id));
          setClickedEdgeInfo(null);
        }}
        onLinkClick={(link, event) => {
          const l = link as GraphLink;
          const src =
            typeof l.source === "object" ? (l.source as GraphNode).id : l.source;
          const tgt =
            typeof l.target === "object" ? (l.target as GraphNode).id : l.target;
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
          setClickedEdgeInfo({
            links: allLinks,
            x: event.clientX,
            y: event.clientY,
          });
          setClickedNodeId(null);
        }}
        onBackgroundClick={() => {
          setClickedNodeId(null);
          setClickedEdgeInfo(null);
        }}
      />

      {/* Edge tooltip */}
      {clickedEdgeInfo && (
        <div
          className="fixed z-50 max-w-xs rounded-lg border border-zinc-600 bg-zinc-900 p-3 shadow-xl text-sm"
          style={{ left: clickedEdgeInfo.x + 8, top: clickedEdgeInfo.y + 8 }}
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
