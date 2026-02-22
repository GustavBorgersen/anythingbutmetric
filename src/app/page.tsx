import fs from "fs";
import path from "path";
import HomeClient from "@/components/HomeClient";
import type { Unit, Edge } from "@/lib/types";

export default function Home() {
  const dataDir = path.join(process.cwd(), "data");
  const seedUnits: Unit[] = JSON.parse(
    fs.readFileSync(path.join(dataDir, "seed-units.json"), "utf-8")
  );
  const seedEdges: Edge[] = JSON.parse(
    fs.readFileSync(path.join(dataDir, "seed-edges.json"), "utf-8")
  );
  const liveUnits: Unit[] = JSON.parse(
    fs.readFileSync(path.join(dataDir, "units.json"), "utf-8")
  );
  const liveEdges: Edge[] = JSON.parse(
    fs.readFileSync(path.join(dataDir, "edges.json"), "utf-8")
  );

  return (
    <main className="h-full">
      <HomeClient
        seedUnits={seedUnits}
        seedEdges={seedEdges}
        liveUnits={liveUnits}
        liveEdges={liveEdges}
      />
    </main>
  );
}
