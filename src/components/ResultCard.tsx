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
  // Very small numbers — keep sig figs, no scientific notation
  if (abs > 0 && abs < 0.001) {
    return n.toPrecision(3);
  }
  // Large numbers: plain integer with commas, no decimals
  if (abs >= 100) {
    return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  // Mid-range: up to 3 significant figures, no trailing zeros
  return n.toLocaleString(undefined, { maximumSignificantDigits: 3 });
}

export default function ResultCard({
  route,
  fromUnit,
  toUnit,
  quantity,
  units,
}: Props) {
  const colour = ROUTE_COLOURS[route.routeIndex % ROUTE_COLOURS.length];

  return (
    <div
      className="rounded-xl border border-zinc-700 bg-zinc-800/95 shadow-2xl overflow-hidden"
      style={{ borderLeftColor: colour, borderLeftWidth: 4 }}
    >
      <div className="p-4">
        {/* Route label */}
        <div
          className="mb-1 text-xs font-semibold uppercase tracking-wider"
          style={{ color: colour }}
        >
          {route.label}
        </div>

        {/* Main result */}
        <div className="text-zinc-100">
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

        {/* Chain of Evidence toggle */}
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">
            Chain of Evidence ({route.steps.length} step
            {route.steps.length !== 1 ? "s" : ""})
          </summary>
          <EvidenceChain steps={route.steps} units={units} />
        </details>
      </div>
    </div>
  );
}
