import { getAdjacency, getEdgeById, getAllEdgesForPair, getUnits } from "./graph";
import type { Route, Step } from "./types";

interface PathNode {
  id: string;
  distance: number;
  parents: Array<{ node: PathNode; edgeId: string; forward: boolean }>;
}

/**
 * BFS all-shortest-paths from fromId to toId.
 * Returns up to maxRoutes Route objects.
 */
export function findRoutes(
  fromId: string,
  toId: string,
  quantity: number,
  mode: "seed" | "live" = "seed",
  maxRoutes = 5
): Route[] {
  if (fromId === toId) return [];

  const adjacency = getAdjacency(mode);
  if (!adjacency.has(fromId) || !adjacency.has(toId)) return [];

  // BFS with parent-list tracking
  const visited = new Map<string, PathNode>();
  const queue: PathNode[] = [];

  const startNode: PathNode = { id: fromId, distance: 0, parents: [] };
  visited.set(fromId, startNode);
  queue.push(startNode);

  let shortestFoundLength: number | null = null;

  while (queue.length > 0) {
    const current = queue.shift()!;

    // Stop expanding if we've passed the shortest path length
    if (
      shortestFoundLength !== null &&
      current.distance >= shortestFoundLength
    ) {
      continue;
    }

    const neighbours = adjacency.get(current.id) ?? [];
    for (const entry of neighbours) {
      const nextDist = current.distance + 1;

      if (!visited.has(entry.neighbourId)) {
        // First time reaching this node
        const newNode: PathNode = {
          id: entry.neighbourId,
          distance: nextDist,
          parents: [
            { node: current, edgeId: entry.edgeId, forward: entry.forward },
          ],
        };
        visited.set(entry.neighbourId, newNode);
        queue.push(newNode);

        if (entry.neighbourId === toId) {
          shortestFoundLength = nextDist;
        }
      } else {
        const existingNode = visited.get(entry.neighbourId)!;
        if (existingNode.distance === nextDist) {
          // Same distance — add as an alternate parent (multiple shortest paths)
          existingNode.parents.push({
            node: current,
            edgeId: entry.edgeId,
            forward: entry.forward,
          });
          // Do NOT re-enqueue
        }
      }
    }
  }

  const endNode = visited.get(toId);
  if (!endNode) return []; // no path

  // Enumerate all paths via backtracking
  const allPaths: Array<
    Array<{ nodeId: string; edgeId: string; forward: boolean }>
  > = [];

  function backtrack(
    node: PathNode,
    trail: Array<{ nodeId: string; edgeId: string; forward: boolean }>
  ) {
    if (node.parents.length === 0) {
      // Reached the start — reverse trail and store
      allPaths.push([...trail].reverse());
      return;
    }
    for (const parent of node.parents) {
      trail.push({
        nodeId: node.id,
        edgeId: parent.edgeId,
        forward: parent.forward,
      });
      backtrack(parent.node, trail);
      trail.pop();
    }
  }

  backtrack(endNode, []);

  // Cap at maxRoutes
  const selectedPaths = allPaths.slice(0, maxRoutes);

  return selectedPaths.map((path, routeIndex) => {
    const nodeIds: string[] = [fromId, ...path.map((p) => p.nodeId)];
    const edgeIds = path.map((p) => p.edgeId);

    const steps: Step[] = path.map((p, i) => {
      const stepFromId = i === 0 ? fromId : path[i - 1].nodeId;
      const stepToId = p.nodeId;

      const edge = getEdgeById(p.edgeId, mode)!;
      const factor = p.forward ? edge.factor : 1 / edge.factor;
      const allEdges = getAllEdgesForPair(stepFromId, stepToId, mode);

      return { fromId: stepFromId, toId: stepToId, factor, edges: allEdges };
    });

    // Accumulate the factor chain
    const accumulatedFactor = steps.reduce((acc, s) => acc * s.factor, 1);
    const result = quantity * accumulatedFactor;

    const units = getUnits(mode);
    const unitLabel = (id: string) =>
      units.find((u) => u.id === id)?.label ?? id;

    let label: string;
    if (nodeIds.length === 2) {
      label = "Direct";
    } else {
      label = "via " + nodeIds.slice(1, -1).map(unitLabel).join(" → ");
    }

    return { routeIndex, label, result, nodeIds, edgeIds, steps };
  });
}
