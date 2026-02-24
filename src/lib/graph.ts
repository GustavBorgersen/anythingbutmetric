import fs from "fs";
import path from "path";
import type { Unit, Edge } from "./types";

export interface AdjacencyEntry {
  edgeId: string;
  neighbourId: string;
  forward: boolean; // true = use edge.factor; false = use 1/edge.factor
}

type DataCache = {
  units: Unit[];
  edges: Edge[];
  adjacency: Map<string, AdjacencyEntry[]>;
};

let _seed: DataCache | null = null;
let _live: DataCache | null = null;

function buildAdjacency(edges: Edge[]): Map<string, AdjacencyEntry[]> {
  const adjacency = new Map<string, AdjacencyEntry[]>();
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);

    adjacency.get(edge.from)!.push({
      edgeId: edge.id,
      neighbourId: edge.to,
      forward: true,
    });

    adjacency.get(edge.to)!.push({
      edgeId: edge.id,
      neighbourId: edge.from,
      forward: false,
    });
  }
  return adjacency;
}

function loadSeed(): DataCache {
  if (_seed) return _seed;
  const dataDir = path.join(process.cwd(), "data");
  const units = JSON.parse(
    fs.readFileSync(path.join(dataDir, "seed-units.json"), "utf-8")
  ) as Unit[];
  const edges = JSON.parse(
    fs.readFileSync(path.join(dataDir, "seed-edges.json"), "utf-8")
  ) as Edge[];
  // All seed edges are hand-verified; no flag filtering needed
  _seed = { units, edges, adjacency: buildAdjacency(edges) };
  return _seed;
}

function loadLive(): DataCache {
  if (_live) return _live;
  const dataDir = path.join(process.cwd(), "data");
  const units = JSON.parse(
    fs.readFileSync(path.join(dataDir, "units.json"), "utf-8")
  ) as Unit[];
  const edges = JSON.parse(
    fs.readFileSync(path.join(dataDir, "edges.json"), "utf-8")
  ) as Edge[];
  // verified flag ignored — merging the scraper PR is the approval step
  _live = { units, edges, adjacency: buildAdjacency(edges) };
  return _live;
}

function getCache(mode: "seed" | "live"): DataCache {
  return mode === "seed" ? loadSeed() : loadLive();
}

export function getUnits(mode: "seed" | "live" = "seed"): Unit[] {
  return getCache(mode).units;
}

export function getEdges(mode: "seed" | "live" = "seed"): Edge[] {
  return getCache(mode).edges;
}

export function getAdjacency(
  mode: "seed" | "live" = "seed"
): Map<string, AdjacencyEntry[]> {
  return getCache(mode).adjacency;
}

export function getEdgeById(
  id: string,
  mode: "seed" | "live" = "seed"
): Edge | undefined {
  return getCache(mode).edges.find((e) => e.id === id);
}

/** All edges between two nodes, in either direction. */
export function getAllEdgesForPair(
  aId: string,
  bId: string,
  mode: "seed" | "live" = "seed"
): Edge[] {
  return getCache(mode).edges.filter(
    (e) =>
      (e.from === aId && e.to === bId) || (e.from === bId && e.to === aId)
  );
}

/**
 * Returns all connected components as arrays of unit IDs, sorted largest first.
 * Island[0] is always the main connected core; [1..] are the bounty targets.
 * Units with no edges at all are appended as single-node islands at the end.
 */
export function getAllIslands(mode: "seed" | "live" = "live"): string[][] {
  const { units, edges } = getCache(mode);
  const connectedIds = new Set<string>(edges.flatMap((e) => [e.from, e.to]));
  const unvisited = new Set<string>(connectedIds);
  const islands: string[][] = [];

  while (unvisited.size > 0) {
    const seed = unvisited.values().next().value as string;
    const island: string[] = [];
    const queue = [seed];
    while (queue.length) {
      const cur = queue.shift()!;
      if (!unvisited.has(cur)) continue;
      unvisited.delete(cur);
      island.push(cur);
      for (const e of edges) {
        if (e.from === cur && unvisited.has(e.to)) queue.push(e.to);
        if (e.to === cur && unvisited.has(e.from)) queue.push(e.from);
      }
    }
    islands.push(island);
  }

  islands.sort((a, b) => b.length - a.length);

  // Isolated units (in units.json but no edges yet)
  for (const u of units) {
    if (!connectedIds.has(u.id)) islands.push([u.id]);
  }

  return islands;
}
