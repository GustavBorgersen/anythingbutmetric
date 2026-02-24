import { getAllIslands, getUnits } from "@/lib/graph";
import BountyClient from "@/components/BountyClient";
import type { Unit } from "@/lib/types";

export const dynamic = "force-dynamic"; // never statically cache — live data changes

export default function BountyPage() {
  const allIslands = getAllIslands("live");
  const units      = getUnits("live");
  const unitMap    = new Map<string, Unit>(units.map((u) => [u.id, u]));

  // Island 0 is the main connected core — not a bounty target.
  // Everything at index 1+ is disconnected and needs a bridge.
  const bountyIslands: Unit[][] = allIslands
    .slice(1)
    .map((ids) => ids.map((id) => unitMap.get(id)).filter((u): u is Unit => !!u));

  return (
    <main className="min-h-full bg-zinc-950 text-zinc-100">
      <BountyClient islands={bountyIslands} />
    </main>
  );
}
