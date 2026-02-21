import fs from "fs";
import path from "path";
import HomeClient from "@/components/HomeClient";
import type { Unit, Edge } from "@/lib/types";

export default function Home() {
  const dataDir = path.join(process.cwd(), "data");
  const units: Unit[] = JSON.parse(
    fs.readFileSync(path.join(dataDir, "units.json"), "utf-8")
  );
  const edges: Edge[] = JSON.parse(
    fs.readFileSync(path.join(dataDir, "edges.json"), "utf-8")
  );

  return (
    <main className="h-full">
      <HomeClient units={units} edges={edges} />
    </main>
  );
}
