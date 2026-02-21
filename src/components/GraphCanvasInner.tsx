"use client";

import { useRef, useEffect, useCallback } from "react";
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
  source: string;
  target: string;
  factor: number;
  verified: boolean;
}

interface Props {
  units: Unit[];
  edges: Edge[];
  highlights: HighlightState[];
}

export default function GraphCanvasInner({ units, edges, highlights }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

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

  const hasHighlights = highlightedNodeIds.size > 0;

  // Remap edges: from/to → source/target (react-force-graph-2d requirement)
  const graphData = {
    nodes: units.map((u) => ({ ...u })) as GraphNode[],
    links: edges.map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      factor: e.factor,
      verified: e.verified,
    })) as GraphLink[],
  };

  const nodeCanvasObject = useCallback(
    (node: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode & { x: number; y: number };
      const isHighlighted = highlightedNodeIds.has(n.id);
      const dimmed = hasHighlights && !isHighlighted;
      const routeIdx = nodeRouteIndex.get(n.id) ?? 0;
      const colour = isHighlighted
        ? ROUTE_COLOURS[routeIdx % ROUTE_COLOURS.length]
        : "#6b7280";

      const radius = isHighlighted ? 6 : 4;
      const alpha = dimmed ? 0.25 : 1;

      ctx.save();
      ctx.globalAlpha = alpha;

      // Node circle
      ctx.beginPath();
      ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI, false);
      ctx.fillStyle = colour;
      ctx.fill();

      // Label
      const label = (n.emoji ? n.emoji + " " : "") + n.label;
      const fontSize = Math.max(4, 10 / globalScale);
      ctx.font = `${fontSize}px sans-serif`;
      ctx.fillStyle = isHighlighted ? "#f9fafb" : "#9ca3af";
      ctx.textAlign = "center";
      ctx.fillText(label, n.x, n.y + radius + fontSize * 1.2);

      ctx.restore();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [highlights]
  );

  const linkColor = useCallback(
    (link: object) => {
      const l = link as GraphLink;
      const isHighlighted = highlightedEdgeIds.has(l.id);
      const dimmed = hasHighlights && !isHighlighted;
      if (dimmed) return "rgba(107,114,128,0.25)";
      if (isHighlighted) {
        const routeIdx = edgeRouteIndex.get(l.id) ?? 0;
        return ROUTE_COLOURS[routeIdx % ROUTE_COLOURS.length];
      }
      return l.verified ? "#4b5563" : "#374151";
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [highlights]
  );

  const linkWidth = useCallback(
    (link: object) => {
      const l = link as GraphLink;
      return highlightedEdgeIds.has(l.id) ? 2.5 : 1;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [highlights]
  );

  return (
    <div ref={containerRef} className="w-full h-full">
      <ForceGraph2D
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
      />
    </div>
  );
}
