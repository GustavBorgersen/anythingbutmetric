# Project Roadmap: The Absolute Unit

**Version:** 1.0
**Status:** Active

---

## Overview

Four phases, each independently deployable. Each phase ends with something live and usable, not a half-built feature. Phases build on each other but do not block each other beyond what is noted.

---

## Phase 1 — Core Demo

**Goal:** A working converter with seed data, deployed publicly. Proves the concept end-to-end.

**Deliverable:** A live Vercel URL where a user can pick two units, hit Convert, and see a result with a Chain of Evidence.

### Tasks

- [ ] Initialise Next.js project with App Router
- [ ] Create `/data/units.json` with ~30 seed units (manually curated)
- [ ] Create `/data/edges.json` with ~50 seed edges (manually sourced from real articles)
- [ ] Implement `src/lib/graph.ts` — load and index units + edges from JSON files
- [ ] Implement `src/lib/pathfinder.ts` — BFS shortest path + factor multiplication + range computation
- [ ] Build `POST /api/convert` route — accepts `{ from, to, quantity }`, returns `{ path, result_min, result_max, evidence }`
- [ ] Build `UnitSelector` component — searchable dropdown backed by units catalogue
- [ ] Build `ResultCard` component — displays result range and "between X and Y" formatting
- [ ] Build `EvidenceChain` component — renders breadcrumb trail with inline citations and clickable source links
- [ ] Build home page (`/`) — wires together UnitSelector + ResultCard + EvidenceChain
- [ ] Handle Missing Link state on home page — clear error message when no path exists
- [ ] Deploy to Vercel, confirm public URL resolves correctly

---

## Phase 2 — Scraper

**Goal:** Automate data growth. New journalistic comparisons are extracted daily without manual intervention.

**Deliverable:** A GitHub Actions workflow that runs every 24 hours, reads RSS feeds, extracts new unit comparisons via Gemini Flash, and opens a pull request with additions to `edges.json`.

**Prerequisite:** Phase 1 complete (need the JSON schema locked before the scraper targets it).

### Tasks

- [ ] Create `scraper/feeds.txt` with initial list of RSS feed URLs (BBC, CNN, The Register, NYT, etc.)
- [ ] Write `scraper/scraper.py`:
  - Fetch and parse RSS feeds
  - Filter items not yet seen (compare against existing `edges.json` source URLs)
  - For each new item, call Gemini Flash with a structured extraction prompt
  - Parse the response into the `edges.json` schema
  - Append new edges (with `verified: false`) to a staging output
- [ ] Write `scraper/requirements.txt` with pinned dependencies
- [ ] Implement deduplication logic — do not add an edge if an identical `(from, to, factor, source_url)` already exists
- [ ] Write extraction prompt for Gemini Flash — must return structured JSON matching the edge schema
- [ ] Create `.github/workflows/scraper.yml`:
  - Cron trigger: daily at 06:00 UTC
  - Steps: checkout repo, install Python deps, run scraper, open PR if new edges found
- [ ] Add `ANTHROPIC_API_KEY` as a GitHub Actions secret
- [ ] Test workflow manually via `workflow_dispatch` trigger before enabling cron
- [ ] Review first 10 automatically extracted edges for quality; adjust prompt if needed

---

## Phase 3 — Universe View

**Goal:** Make the data visually explorable. Users can browse the entire knowledge graph as an interactive force-directed diagram.

**Deliverable:** A live `/universe` page showing all units and connections, zoomable and pannable, with emoji nodes and clickable edges.

**Prerequisite:** Phase 1 complete (need the graph data and its structure).

### Tasks

- [ ] Install `react-force-graph-2d`
- [ ] Build `UniverseGraph` component:
  - Load all nodes from `units.json` and all verified edges from `edges.json`
  - Render nodes with emoji label (fallback to text label if no emoji)
  - Render edges with weight proportional to factor magnitude (optional visual polish)
  - Implement zoom and pan controls
- [ ] On node click: highlight all direct neighbours and their connecting edges; dim everything else
- [ ] On edge click: surface a tooltip showing `source_quote` and `source_url` link
- [ ] Build `/universe` page — wraps `UniverseGraph` with a title and brief explanatory text
- [ ] Link to Universe View from the home page result area and main navigation
- [ ] Performance check: confirm the graph renders acceptably with 500+ nodes (canvas rendering should handle this)

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
