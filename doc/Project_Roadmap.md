# Project Roadmap: The Anything But Metric converter

**Version:** 1.0
**Status:** Active

---

## Overview

Four phases, each independently deployable. Each phase ends with something live and usable, not a half-built feature. Phases build on each other but do not block each other beyond what is noted.

---

## Phase 1 — Core Demo ✓ Complete

**Goal:** A working converter with seed data, deployed publicly. Proves the concept end-to-end.

**Deliverable:** A live Vercel URL where a user can pick two units and immediately see results with a Chain of Evidence alongside an interactive graph canvas — a graph-first single-page app with no Convert button.

### Tasks

- [x] Initialise Next.js project with App Router
- [x] Create `/data/units.json` with ~30 seed units (manually curated)
- [x] Create `/data/edges.json` with ~50 seed edges (manually sourced from real articles)
- [x] Implement `src/lib/graph.ts` — load and index units + edges from JSON files
- [x] Implement `src/lib/pathfinder.ts` — BFS all shortest paths; multi-route response with nodeIds, edgeIds, routeIndex per route
- [x] Build `POST /api/convert` route — accepts `{ from, to, quantity }`, returns array of route objects each with routeIndex, label, result, nodeIds, edgeIds, steps
- [x] Build `UnitSelector` component — searchable dropdown backed by units catalogue
- [x] Build `ResultCard` component — displays one route's result and its Chain of Evidence; conflicting sources shown inline
- [x] Build `EvidenceChain` component — renders breadcrumb trail with inline citations and clickable source links
- [x] Build `GraphCanvas` component — react-force-graph-2d wrapper; renders all nodes and edges; accepts highlight state (nodeIds[], edgeIds[], routeIndex) as props; basic zoom/pan only at this stage
- [x] Implement reactive convert trigger — on second unit selection, POST to /api/convert, pass returned route nodeIds/edgeIds to GraphCanvas; no Convert button
- [x] Build home page (`/`) — wires together UnitSelector + ResultCard + EvidenceChain + GraphCanvas
- [x] Handle Missing Link state on home page — clear error message when no path exists
- [x] Deploy to Vercel, confirm public URL resolves correctly

### Post-launch polish (complete)

- [x] Mobile responsive layout — single-row controls bar with `min-w-0` flex constraints; result cards stack below controls on mobile (scrollable, max-h 45vh); graph fills remaining viewport height
- [x] Collapsible result cards — header always shows a one-line summary; body toggles open/closed
- [x] Graph touch support — `touch-action: none` on canvas container so d3-zoom receives touch events on mobile
- [x] Prevent overscroll bleed — `background-color`, `overflow: hidden`, and `overscroll-behavior: none` on `html`/`body`

---

## Phase 2 — Scraper

**Goal:** Automate data growth. New journalistic comparisons are extracted daily without manual intervention.

**Deliverable:** A GitHub Actions workflow that runs every 24 hours, reads RSS feeds, extracts new unit comparisons via Claude Haiku, and opens a pull request with additions to `edges.json`.

**Prerequisite:** Phase 1 complete (need the JSON schema locked before the scraper targets it).

### Tasks

- [ ] Create `scraper/feeds.txt` with initial list of RSS feed URLs (BBC, CNN, The Register, NYT, etc.)
- [ ] Write `scraper/scraper.py`:
  - Fetch and parse RSS feeds
  - Filter items not yet seen (compare against existing `edges.json` source URLs)
  - For each new item, call Claude Haiku with a structured extraction prompt
  - Parse the response into the `edges.json` schema
  - Append new edges (with `verified: false`) to a staging output
- [ ] Write `scraper/requirements.txt` with pinned dependencies
- [ ] Implement deduplication logic — do not add an edge if an identical `(from, to, factor, source_url)` already exists
- [ ] Write extraction prompt for Claude Haiku — must return structured JSON matching the edge schema
- [ ] Create `.github/workflows/scraper.yml`:
  - Cron trigger: daily at 06:00 UTC
  - Steps: checkout repo, install Python deps, run scraper, open PR if new edges found
- [ ] Add `ANTHROPIC_API_KEY` as a GitHub Actions secret
- [ ] Test workflow manually via `workflow_dispatch` trigger before enabling cron
- [ ] Review first 10 automatically extracted edges for quality; adjust prompt if needed

---

## Phase 3 — Graph Polish & Interactions

**Goal:** Elevate the basic graph canvas from Phase 1 into the full interactive experience described in the functional spec.

**Deliverable:** The graph canvas has emoji nodes, colour-coded multi-route highlighting, auto-camera, full click interactions in both default and active states, and Missing Link visual treatment. Performs acceptably at 500+ nodes.

**Prerequisite:** Phase 1 complete (GraphCanvas component exists with basic zoom/pan).

### Tasks

- [ ] Add emoji/icon rendering to graph nodes (fallback to text label if none)
- [ ] Implement colour-per-route: each route's nodeIds/edgeIds highlighted in a distinct colour matching its result card accent
- [ ] Implement auto-pan and zoom-to-fit animation when a path is highlighted
- [ ] Default state — on node click: highlight direct connections, dim everything else
- [ ] Default state — on edge click: surface tooltip with source_quote + clickable source_url
- [ ] Active state — dimmed nodes/edges remain clickable; clicking a dimmed node shows its connections without clearing the current conversion
- [ ] Missing Link visual: highlight the two disconnected islands in distinct colours in the graph
- [ ] Smooth transitions between default/active/missing-link states
- [ ] Performance check: confirm graph renders acceptably at 500+ nodes

---

## Phase 4 — Community

**Goal:** Let users contribute data. The Bounty Board surfaces missing connections; the submission form feeds a reviewed queue.

**Deliverable:** A live `/bounty` page listing unconnected islands, a submission form on each entry, and a GitHub Issues queue that maintainers can review and merge.

**Prerequisite:** Phase 1 complete (need the pathfinder to detect disconnected components); Phase 2 helps (more data = more interesting gaps).

### Tasks

- [ ] Implement disconnected component detection in `src/lib/graph.ts` — identify all islands not reachable from the largest connected component
- [ ] Build `POST /api/submit` route:
  - Validate payload: URL parseable, factor > 0, `from` and `to` exist in units catalogue
  - On pass: call GitHub Issues API to create a labelled Issue (`submission/pending`)
  - Return success or validation error to the client
- [ ] Implement `src/lib/github.ts` — thin wrapper around GitHub Issues API
- [ ] Add `GITHUB_TOKEN` and `GITHUB_REPO` as environment variables (local + Vercel + Actions)
- [ ] Build submission form component — fields: source URL, quote, from unit, to unit, factor
- [ ] Build Bounty Board page (`/bounty`):
  - List all disconnected islands with their member units
  - Each island has a **Submit a Source** CTA that opens the submission form pre-filled with relevant unit context
- [ ] Submission confirmation state — after successful POST, show "Thanks — your submission is in review" message
- [ ] Create GitHub Issue template for submissions (`.github/ISSUE_TEMPLATE/unit_submission.md`) to standardise the queue format
- [ ] Document the maintainer review process in a `CONTRIBUTING.md` (accept → add to edges.json → close Issue; reject → comment + close)
- [ ] Link to Bounty Board from Missing Link error state on the home page
