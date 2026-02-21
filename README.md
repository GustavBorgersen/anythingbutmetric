# Anything But Metric

A web-based journalistic unit converter. Pick any two units and it finds a path between them through a graph of real news article comparisons — giving you results in Double-Decker Buses, Olympic Swimming Pools, Wales, Whales, or whatever the journalists happened to use.

## How it works

Every edge in the graph is a real comparison from a real article ("the crater is roughly the size of Wales", "that's about 400 double-decker buses end to end"). A BFS pathfinder finds the shortest chain of comparisons between any two units, and each step in the chain links back to the source article.

## Documentation

- [Functional Specification](doc/Functional_Specification.md) — what the product does and why
- [Technical Specification](doc/Technical_Specification.md) — stack, schemas, architecture
- [Project Roadmap](doc/Project_Roadmap.md) — four-phase build plan and progress

## Development

Requires Node 20 (via [nvm](https://github.com/nvm-sh/nvm)).

```bash
nvm use 20
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
