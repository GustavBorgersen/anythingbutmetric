import type { Step, Unit } from "@/lib/types";

interface Props {
  steps: Step[];
  units: Unit[];
}

function unitLabel(units: Unit[], id: string): string {
  const u = units.find((u) => u.id === id);
  return u ? `${u.emoji ?? ""} ${u.label}`.trim() : id;
}

function formatFactor(n: number): string {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1000) {
    return Math.round(n).toLocaleString("en-GB");
  }
  if (abs < 0.001) {
    const dp = -Math.floor(Math.log10(abs)) + 2;
    return n.toFixed(dp);
  }
  return parseFloat(n.toPrecision(4)).toString();
}

export default function EvidenceChain({ steps, units }: Props) {
  return (
    <div className="mt-3 space-y-3">
      {steps.map((step, i) => {
        const primary = step.edges[0]; // the edge used in pathfinding
        const conflicts = step.edges.slice(1); // additional sources

        return (
          <div
            key={i}
            className="rounded-md border border-zinc-700 bg-zinc-900/60 p-3 text-xs"
          >
            {/* Step header */}
            <div className="flex items-center gap-2 font-mono text-zinc-100">
              <span className="text-zinc-400">{unitLabel(units, step.fromId)}</span>
              <span className="text-zinc-600">→</span>
              <span className="font-semibold text-amber-400">
                ×{formatFactor(step.factor)}
              </span>
              <span className="text-zinc-600">→</span>
              <span className="text-zinc-400">{unitLabel(units, step.toId)}</span>
            </div>

            {/* Primary source */}
            {primary && (
              <div className="mt-2 space-y-1">
                <blockquote className="border-l-2 border-zinc-600 pl-2 italic text-zinc-400">
                  "{primary.source_quote}"
                </blockquote>
                <a
                  href={primary.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline break-all"
                >
                  {primary.source_url}
                </a>
              </div>
            )}

            {/* Conflicting sources */}
            {conflicts.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">
                  {conflicts.length} conflicting source
                  {conflicts.length !== 1 ? "s" : ""}
                </summary>
                <div className="mt-2 space-y-2 pl-2">
                  {conflicts.map((edge) => (
                    <div
                      key={edge.id}
                      className="rounded border border-zinc-700 p-2 text-zinc-500"
                    >
                      <div className="font-mono text-zinc-400">
                        ×
                        {formatFactor(
                          edge.from === step.fromId
                            ? edge.factor
                            : 1 / edge.factor
                        )}
                      </div>
                      <blockquote className="mt-1 border-l-2 border-zinc-700 pl-2 italic">
                        "{edge.source_quote}"
                      </blockquote>
                      <a
                        href={edge.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline break-all"
                      >
                        {edge.source_url}
                      </a>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}
