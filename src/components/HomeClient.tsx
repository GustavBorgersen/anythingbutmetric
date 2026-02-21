"use client";

import { useState, useEffect, useCallback } from "react";
import UnitSelector from "./UnitSelector";
import ResultCard from "./ResultCard";
import GraphCanvas from "./GraphCanvas";
import type { Unit, Edge, Route, HighlightState } from "@/lib/types";

interface Props {
  units: Unit[];
  edges: Edge[];
}

export default function HomeClient({ units, edges }: Props) {
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(false);
  const [noPath, setNoPath] = useState(false);

  const doConvert = useCallback(
    async (from: string, to: string, qty: number) => {
      setLoading(true);
      setNoPath(false);
      try {
        const res = await fetch("/api/convert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from, to, quantity: qty }),
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

  // Reactive convert: fires whenever both units are selected
  useEffect(() => {
    if (fromId && toId) {
      doConvert(fromId, toId, quantity);
    } else {
      setRoutes([]);
      setNoPath(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromId, toId, quantity]);

  // Derive highlight state from routes
  const highlights: HighlightState[] = routes.map((r) => ({
    nodeIds: r.nodeIds,
    edgeIds: r.edgeIds,
    routeIndex: r.routeIndex,
  }));

  const fromUnit = units.find((u) => u.id === fromId) ?? null;
  const toUnit = units.find((u) => u.id === toId) ?? null;

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100">
      {/* Controls bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 flex-wrap">
        <UnitSelector
          units={units}
          value={fromId}
          onChange={setFromId}
          placeholder="From unit…"
        />

        <div className="flex items-center gap-1">
          <label htmlFor="qty" className="text-zinc-500 text-sm sr-only">
            Quantity
          </label>
          <input
            id="qty"
            type="number"
            value={quantity}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (isFinite(v)) setQuantity(v);
            }}
            className="w-24 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 text-right outline-none focus:border-zinc-400"
            step="any"
          />
        </div>

        <UnitSelector
          units={units}
          value={toId}
          onChange={setToId}
          placeholder="To unit…"
        />

        {loading && (
          <span className="text-xs text-zinc-500 animate-pulse">
            Computing…
          </span>
        )}
      </div>

      {/* Main content: graph fills flex-1, result cards overlay top-left */}
      <div className="relative flex-1 overflow-hidden">
        <GraphCanvas units={units} edges={edges} highlights={highlights} />

        {/* Result cards overlay */}
        <div className="absolute top-4 left-4 space-y-3 max-w-sm w-full z-10 max-h-[calc(100vh-120px)] overflow-y-auto pr-1">
          {noPath && fromId && toId && (
            <div className="rounded-xl border border-zinc-700 bg-zinc-800/95 p-4 shadow-2xl text-sm">
              <div className="text-amber-400 font-semibold mb-1">
                Missing Link
              </div>
              <div className="text-zinc-400">
                No path found between{" "}
                <span className="text-zinc-200">{fromUnit?.label}</span> and{" "}
                <span className="text-zinc-200">{toUnit?.label}</span> in the
                current graph.
              </div>
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
                units={units}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
