import fs from "fs";
import path from "path";
import type { Unit, Edge } from "./types";

export interface AdjacencyEntry {
  edgeId: string;
  neighbourId: string;
  forward: boolean; // true = use edge.factor; false = use 1/edge.factor
}

let _units: Unit[] | null = null;
let _edges: Edge[] | null = null;
let _adjacency: Map<string, AdjacencyEntry[]> | null = null;

function loadData() {
  if (_units && _edges && _adjacency) return;

  const dataDir = path.join(process.cwd(), "data");
  _units = JSON.parse(
    fs.readFileSync(path.join(dataDir, "units.json"), "utf-8")
  ) as Unit[];
  _edges = JSON.parse(
    fs.readFileSync(path.join(dataDir, "edges.json"), "utf-8")
  ) as Edge[];

  _adjacency = new Map<string, AdjacencyEntry[]>();

  for (const edge of _edges) {
    if (!edge.verified) continue; // only verified edges for pathfinding

    if (!_adjacency.has(edge.from)) _adjacency.set(edge.from, []);
    if (!_adjacency.has(edge.to)) _adjacency.set(edge.to, []);

    _adjacency.get(edge.from)!.push({
      edgeId: edge.id,
      neighbourId: edge.to,
      forward: true,
    });

    _adjacency.get(edge.to)!.push({
      edgeId: edge.id,
      neighbourId: edge.from,
      forward: false,
    });
  }
}

export function getUnits(): Unit[] {
  loadData();
  return _units!;
}

export function getEdges(): Edge[] {
  loadData();
  return _edges!;
}

export function getAdjacency(): Map<string, AdjacencyEntry[]> {
  loadData();
  return _adjacency!;
}

export function getEdgeById(id: string): Edge | undefined {
  loadData();
  return _edges!.find((e) => e.id === id);
}

/** All edges (verified or not) between two nodes, in either direction. */
export function getAllEdgesForPair(aId: string, bId: string): Edge[] {
  loadData();
  return _edges!.filter(
    (e) =>
      (e.from === aId && e.to === bId) || (e.from === bId && e.to === aId)
  );
}
