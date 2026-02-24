"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import UnitSelector from "./UnitSelector";
import ResultCard from "./ResultCard";
import GraphCanvas from "./GraphCanvas";
import SubmitForm from "./SubmitForm";
import type { Unit, Edge, Route, HighlightState } from "@/lib/types";

interface Props {
  seedUnits: Unit[];
  seedEdges: Edge[];
  liveUnits: Unit[];
  liveEdges: Edge[];
}

function getIsland(startId: string, edges: Edge[]): Set<string> {
  const visited = new Set<string>();
  const queue = [startId];
  while (queue.length) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const e of edges) {
      if (e.from === cur && !visited.has(e.to)) queue.push(e.to);
      if (e.to === cur && !visited.has(e.from)) queue.push(e.from);
    }
  }
  return visited;
}

export default function HomeClient({
  seedUnits,
  seedEdges,
  liveUnits,
  liveEdges,
}: Props) {
  const [mode, setMode] = useState<"seed" | "live">("live");
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const quantity = 1;
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(false);
  const [noPath, setNoPath] = useState(false);

  const activeUnits = mode === "seed" ? seedUnits : liveUnits;
  const activeEdges = mode === "seed" ? seedEdges : liveEdges;
  const connectedIds = new Set(activeEdges.flatMap((e) => [e.from, e.to]));
  const selectableUnits = activeUnits.filter((u) => connectedIds.has(u.id));

  const doConvert = useCallback(
    async (from: string, to: string, qty: number, m: "seed" | "live") => {
      setLoading(true);
      setNoPath(false);
      try {
        const res = await fetch("/api/convert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from, to, quantity: qty, mode: m }),
        });
        const data: Route[] = await res.json();
        setRoutes(data);
        setNoPath(data.length === 0);
      } catch {
        setRoutes([]);
        setNoPath(true);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Reset selections when mode changes
  useEffect(() => {
    setFromId(null);
    setToId(null);
    setRoutes([]);
    setNoPath(false);
  }, [mode]);

  // Reactive convert: fires whenever both units are selected
  useEffect(() => {
    if (fromId && toId) {
      doConvert(fromId, toId, quantity, mode);
    } else {
      setRoutes([]);
      setNoPath(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromId, toId, quantity, mode]);

  // Memoised so GraphCanvasInner's auto-zoom effect only fires when routes
  // actually change, not on every HomeClient re-render.
  const highlights: HighlightState[] = useMemo(
    () =>
      routes.map((r) => ({
        nodeIds: r.nodeIds,
        edgeIds: r.edgeIds,
        routeIndex: r.routeIndex,
      })),
    [routes]
  );

  const missingLinkGroups: [string[], string[]] | null = useMemo(
    () =>
      noPath && fromId && toId
        ? [
            Array.from(getIsland(fromId, activeEdges)),
            Array.from(getIsland(toId, activeEdges)),
          ]
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [noPath, fromId, toId, activeEdges]
  );

  const fromUnit = activeUnits.find((u) => u.id === fromId) ?? null;
  const toUnit = activeUnits.find((u) => u.id === toId) ?? null;

  const cardList = (
    <>
      {noPath && fromId && toId && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-800/95 p-4 shadow-2xl text-sm space-y-3">
          <div className="text-amber-400 font-semibold">Missing Link</div>
          <div className="text-zinc-400">
            No path found between{" "}
            <span className="text-zinc-200">{fromUnit?.label}</span> and{" "}
            <span className="text-zinc-200">{toUnit?.label}</span>.
          </div>
          <div className="text-xs text-zinc-500">
            Know an article that connects them?{" "}
            <a href="/bounty" className="text-amber-400 hover:text-amber-300 underline">
              View Bounty Board
            </a>{" "}
            or submit one below.
          </div>
          <SubmitForm />
        </div>
      )}

      {!noPath &&
        fromUnit &&
        toUnit &&
        routes.map((route) => (
          <ResultCard
            key={route.routeIndex}
            route={route}
            fromUnit={fromUnit}
            toUnit={toUnit}
            quantity={quantity}
            units={activeUnits}
          />
        ))}
    </>
  );

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100">
      {/* Controls bar — single row on all sizes */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
        <div className="flex-1 min-w-0">
          <UnitSelector
            units={selectableUnits}
            value={fromId}
            onChange={setFromId}
            placeholder="From unit…"
          />
        </div>

        <div className="flex-1 min-w-0">
          <UnitSelector
            units={selectableUnits}
            value={toId}
            onChange={setToId}
            placeholder="To unit…"
          />
        </div>

        {/* Mode toggle */}
        <div className="flex shrink-0 rounded-full border border-zinc-700 overflow-hidden text-xs font-medium">
          <button
            onClick={() => setMode("seed")}
            className={`px-3 py-1 transition-colors ${
              mode === "seed"
                ? "bg-zinc-200 text-zinc-900"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Demo
          </button>
          <button
            onClick={() => setMode("live")}
            className={`px-3 py-1 transition-colors ${
              mode === "live"
                ? "bg-zinc-200 text-zinc-900"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Live
          </button>
        </div>

        <a href="/bounty"
           className="shrink-0 text-xs text-zinc-500 hover:text-amber-400 transition-colors">
          Bounty
        </a>

        {loading && (
          <span className="text-xs text-zinc-500 animate-pulse shrink-0">…</span>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden sm:relative">
        {/* Mobile: result cards in normal flow, scrollable */}
        <div className="sm:hidden overflow-y-auto shrink-0 max-h-[45vh] px-4 py-3 space-y-3">
          {cardList}
        </div>

        {/* Graph: fills remaining height on mobile, full area on desktop */}
        <div className="flex-1 min-h-0 overflow-hidden sm:absolute sm:inset-0">
          <GraphCanvas
            units={activeUnits}
            edges={activeEdges}
            highlights={highlights}
            missingLinkGroups={missingLinkGroups}
          />
        </div>

        {/* Desktop: result cards overlay top-left */}
        <div className="hidden sm:block absolute top-4 left-4 space-y-3 max-w-sm w-full z-10 max-h-[calc(100vh-120px)] overflow-y-auto pr-1">
          {cardList}
        </div>
      </div>
    </div>
  );
}
