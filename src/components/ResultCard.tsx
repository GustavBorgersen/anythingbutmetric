"use client";

import { useState } from "react";
import { ROUTE_COLOURS } from "@/lib/constants";
import EvidenceChain from "./EvidenceChain";
import type { Route, Unit } from "@/lib/types";

interface Props {
  route: Route;
  fromUnit: Unit;
  toUnit: Unit;
  quantity: number;
  units: Unit[];
}

function formatResult(n: number): string {
  if (!isFinite(n)) return "∞";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 100) {
    return Math.round(n).toLocaleString("en-GB");
  }
  if (abs < 0.001) {
    const dp = -Math.floor(Math.log10(abs)) + 2;
    return n.toFixed(dp);
  }
  return parseFloat(n.toPrecision(3)).toString();
}

export default function ResultCard({
  route,
  fromUnit,
  toUnit,
  quantity,
  units,
}: Props) {
  const [open, setOpen] = useState(true);
  const colour = ROUTE_COLOURS[route.routeIndex % ROUTE_COLOURS.length];

  return (
    <div
      className="rounded-xl border border-zinc-700 bg-zinc-800/95 shadow-2xl overflow-hidden"
      style={{ borderLeftColor: colour, borderLeftWidth: 4 }}
    >
      {/* Header — always visible, click to toggle */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div className="flex-1 min-w-0">
          <div
            className="text-xs font-semibold uppercase tracking-wider mb-0.5"
            style={{ color: colour }}
          >
            {route.label}
          </div>
          <div className="text-sm text-zinc-300 truncate">
            {formatResult(quantity)}{" "}
            {fromUnit.emoji} {fromUnit.label}{" "}
            <span className="text-zinc-500">=</span>{" "}
            <span style={{ color: colour }}>{formatResult(route.result)}</span>{" "}
            {toUnit.emoji} {toUnit.label}
          </div>
        </div>
        <span className="text-zinc-500 text-xs shrink-0 select-none">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {/* Expandable body */}
      {open && (
        <div className="px-4 pb-4 border-t border-zinc-700/50">
          {/* Main result */}
          <div className="text-zinc-100 pt-3">
            <span className="text-2xl font-bold tabular-nums">
              {formatResult(quantity)}
            </span>
            <span className="mx-2 text-zinc-500">
              {fromUnit.emoji} {fromUnit.label}
            </span>
            <span className="text-zinc-500">=</span>
          </div>
          <div className="mt-1 text-zinc-100">
            <span className="text-2xl font-bold tabular-nums" style={{ color: colour }}>
              {formatResult(route.result)}
            </span>
            <span className="mx-2 text-zinc-400">
              {toUnit.emoji} {toUnit.label}
            </span>
          </div>

          {/* Chain of Evidence */}
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">
              Chain of Evidence ({route.steps.length} step
              {route.steps.length !== 1 ? "s" : ""})
            </summary>
            <EvidenceChain steps={route.steps} units={units} />
          </details>
        </div>
      )}
    </div>
  );
}
