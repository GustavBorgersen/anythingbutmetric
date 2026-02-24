"use client";

import { useState } from "react";
import SubmitForm from "./SubmitForm";
import type { Unit } from "@/lib/types";

interface Props {
  islands: Unit[][];
}

export default function BountyClient({ islands }: Props) {
  // null = no form open; -1 = standalone form; 0..n = island index
  const [submitIslandIdx, setSubmitIslandIdx] = useState<number | null>(null);

  function toggleIslandForm(idx: number) {
    setSubmitIslandIdx((prev) => (prev === idx ? null : idx));
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Bounty Board</h1>
        <p className="mt-1 text-sm text-zinc-400">
          These unit islands are disconnected from the main graph. Submit an article
          that bridges the gap to earn the connection.
        </p>
      </div>

      {islands.length === 0 ? (
        <div className="rounded-xl border border-emerald-700 bg-emerald-900/20 p-6 text-center space-y-3">
          <div className="text-2xl">🎉</div>
          <div className="text-emerald-300 font-semibold">The graph is fully connected!</div>
          <p className="text-sm text-zinc-400">
            Every unit can be reached from every other unit. Still found a great article?
          </p>
          <div className="pt-2">
            <button
              onClick={() => setSubmitIslandIdx((p) => (p === -1 ? null : -1))}
              className="text-sm text-amber-400 hover:text-amber-300 underline"
            >
              Submit any article
            </button>
          </div>
          {submitIslandIdx === -1 && (
            <div className="mt-3 text-left">
              <SubmitForm onSuccess={() => setSubmitIslandIdx(null)} />
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {islands.map((island, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
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
                  <button
                    onClick={() => toggleIslandForm(idx)}
                    className="shrink-0 rounded-lg border border-zinc-600 px-3 py-1 text-xs text-zinc-300
                               hover:border-amber-500 hover:text-amber-400 transition-colors"
                  >
                    {submitIslandIdx === idx ? "Cancel" : "Submit an article"}
                  </button>
                </div>

                {submitIslandIdx === idx && (
                  <SubmitForm onSuccess={() => setSubmitIslandIdx(null)} />
                )}
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-zinc-800 text-center">
            <p className="text-xs text-zinc-500 mb-2">
              Not filling a gap? You can still submit any article.
            </p>
            <button
              onClick={() => setSubmitIslandIdx((p) => (p === -1 ? null : -1))}
              className="text-sm text-amber-400 hover:text-amber-300 underline"
            >
              Submit any article
            </button>
            {submitIslandIdx === -1 && (
              <div className="mt-3 text-left">
                <SubmitForm onSuccess={() => setSubmitIslandIdx(null)} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
