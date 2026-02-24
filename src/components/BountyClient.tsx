import SubmitForm from "./SubmitForm";
import type { Unit } from "@/lib/types";

interface Props {
  islands: Unit[][];
}

export default function BountyClient({ islands }: Props) {
  return (
    <div className="h-screen flex flex-col max-w-2xl mx-auto px-4">

      {/* Header — fixed, non-scrolling */}
      <div className="py-6 space-y-4 flex-shrink-0">
        <a href="/"
           className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-amber-400 transition-colors">
          ← Back to graph
        </a>

        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Bounty Board</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {islands.length > 0
              ? "These unit islands are disconnected from the main graph. Submit an article that bridges the gap."
              : "The graph is fully connected! Still found a great article? Submit it below."}
          </p>
        </div>

        <SubmitForm />
      </div>

      {/* Scrollable island list */}
      {islands.length > 0 && (
        <div className="flex-1 overflow-y-auto pb-8 border-t border-zinc-800">
          <p className="text-xs text-zinc-500 py-3">
            {islands.length} disconnected island{islands.length !== 1 ? "s" : ""}
          </p>
          <div className="space-y-2">
            {islands.map((island, idx) => (
              <div key={idx} className="rounded-xl border border-zinc-700 bg-zinc-900 p-3">
                <div className="flex flex-wrap gap-2">
                  {island.map((unit) => (
                    <span
                      key={unit.id}
                      className="inline-flex items-center gap-1 rounded-full bg-zinc-800 border border-zinc-700 px-2 py-0.5 text-xs text-zinc-200"
                    >
                      {unit.emoji && <span>{unit.emoji}</span>}
                      {unit.label}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
