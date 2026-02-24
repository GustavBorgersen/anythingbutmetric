# Project Roadmap: The Anything But Metric converter

**Version:** 1.4
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

## Phase 2 — Scraper ✓ Nearly Complete

**Goal:** Automate data growth. New journalistic comparisons are extracted daily without manual intervention.

**Deliverable:** A GitHub Actions workflow that runs every 24 hours, reads RSS feeds, extracts new unit comparisons via LLM, and opens a pull request with additions to `edges.json` and `units.json`. Merging the PR is the human review step.

**Prerequisite:** Phase 1 complete (need the JSON schema locked before the scraper targets it).

### Tasks

- [x] Create `scraper/feeds.txt` with initial list of RSS feed URLs (BBC, Guardian, Reuters, New Scientist, The Register, NYT)
- [x] Write `scraper/scraper.py`:
  - Fetch and parse RSS feeds (feedparser); also accepts direct article URLs in `feeds.txt`
  - Filter items not yet seen (compare against existing `edges.json` source URLs)
  - For each new item, fetch full article text via trafilatura (fallback: Jina Reader)
  - Call Groq (Llama) as primary LLM, fall back to Gemini Flash if Groq quota is exhausted
  - Parse the LLM response into the `edges.json` / `units.json` schema
  - Append new edges (`verified: false`) and new units to accumulators
- [x] Write `scraper/requirements.txt` with pinned dependencies
- [x] Implement deduplication logic — skip edges with identical `(from, to, factor, source_url)`; skip articles whose URL already appears in `edges.json`
- [x] Write extraction prompt — returns structured JSON; hard rules on what counts as a valid comparison; instructs LLM to return existing unit `id` for known units (matched by id, label, or alias) and a full unit object for genuinely new ones
- [x] Resolve unit by id, label, or alias — `terms_to_id` lookup prevents creating duplicate units when the LLM returns a label or alias instead of the exact id
- [x] Handle LLM returning plain string id for unknown units — synthesise a minimal new unit rather than dropping the comparison
- [x] Dedup new units within a single run — when multiple comparisons in one article reference the same new unit, reuse the already-queued id instead of creating `_2` variants
- [x] Create `.github/workflows/scraper.yml`:
  - Cron trigger: daily at 06:00 UTC
  - `workflow_dispatch` with `clear_scraped` boolean input (resets `edges.json` to `[]` and restores `units.json` from seed — useful for test resets)
  - Steps: checkout repo, install Python deps, (optionally clear data), run scraper, open PR if new edges found
- [x] Add `GOOGLE_AI_API_KEY` and `GROQ_API_KEY` as GitHub Actions secrets
- [x] Separate seed data from live data:
  - `data/seed-units.json` + `data/seed-edges.json` — frozen hand-crafted files, never written by automation
  - `data/units.json` + `data/edges.json` — live files, grown by scraper PRs
- [x] Demo/Live mode toggle in UI — "Demo" shows seed data; "Live" shows scraped data; unit selectors and graph both update; defaults to Live
- [x] Filter graph nodes and unit selectors to only show units that have at least one edge
- [x] Test workflow end-to-end via `workflow_dispatch`; first PR reviewed and merged successfully

### Post-launch improvements (complete)

- [x] Age-based RSS entry filtering (`--max-age-hours`, default 26 h) — skips entries older than the cron cadence to avoid redundant LLM calls on already-seen articles; `max_age_hours` workflow_dispatch input allows backfilling new feeds by setting to `0`
- [x] Fix feed-URL fallback — scraper now checks `feed.version` and `feed.status` before treating an empty feedparser result as a direct article URL; HTTP errors and genuinely empty feeds are skipped rather than fetched as articles
- [x] Logging cleanup — per-feed summary lines replace per-article verbose output; `-v/--verbose` flag restores debug detail; `--url` mode auto-enables verbose
- [x] Add `"times smaller than"` to comparison keyword list — was wrongly rejecting valid quotes like "about 40 times smaller than the US"

### Remaining

- [ ] Continue prompt refinement as more scraped edges are reviewed — edge cases in what the LLM accepts as a "valid comparison" will surface over the first few production runs

---

## Phase 3 — Graph Polish & Interactions ✓ Complete

**Goal:** Elevate the basic graph canvas from Phase 1 into the full interactive experience described in the functional spec.

**Deliverable:** The graph canvas has emoji nodes, colour-coded multi-route highlighting, auto-camera, full click interactions in both default and active states, and Missing Link visual treatment. Performs acceptably at 500+ nodes.

**Prerequisite:** Phase 1 complete (GraphCanvas component exists with basic zoom/pan).

### Tasks

- [x] Add emoji/icon rendering to graph nodes (fallback to text label if none)
- [x] Implement colour-per-route: each route's nodeIds/edgeIds highlighted in a distinct colour matching its result card accent
- [x] Implement auto-pan and zoom-to-fit animation when a path is highlighted
- [x] Default state — on node click: highlight direct connections, dim everything else
- [x] Default state — on edge click: surface tooltip with source_quote + clickable source_url
- [x] Active state — dimmed nodes/edges remain clickable; clicking a dimmed node shows its connections without clearing the current conversion
- [x] Missing Link visual: highlight the two disconnected islands in distinct colours in the graph
- [x] Smooth transitions between default/active/missing-link states (camera zoomToFit covers this; per-node CSS transitions are a canvas limitation — skipped)
- [x] Performance check: confirm graph renders acceptably at 500+ nodes (deferred; architecture validated; test naturally as scraper grows dataset)

---

## Phase 4 — Community ✓ Nearly Complete

**Goal:** Let users contribute data. The Bounty Board surfaces missing connections; the submission form triggers the scraper against a user-provided article URL and opens a reviewed PR (edges found) or a labelled issue (scraper miss).

**Deliverable:** A live `/bounty` page listing unconnected islands, a URL submission form, a `workflow_dispatch` GitHub Actions workflow that runs the scraper on the submitted URL, and automatic PR or issue creation.

**Prerequisite:** Phase 1 complete (need the pathfinder to detect disconnected components); Phase 2 helps (more data = more interesting gaps).

### Tasks

- [x] Add `getAllIslands(mode)` to `src/lib/graph.ts` — BFS connected-component detection; returns `string[][]` sorted largest-first; units with no edges appended as single-node islands
- [x] Add `--dump-text-to FILEPATH` flag to `scraper.py` — pre-fetches article text and writes it to a file before processing (avoids double-fetch); used by the submission workflow for scraper-miss issues
- [x] Create `.github/workflows/submission-scraper.yml`:
  - `workflow_dispatch` trigger with `article_url` input; not triggered on push
  - Runs scraper in single-URL mode; stderr (debug log) captured separately from stdout (`NEW_EDGES`)
  - On new edges: opens branch `submission/YYYY-MM-DD-{url-hash}`, commits data files, opens PR labelled `community-submission`
  - On miss: opens issue labelled `scraper-miss` with full article text (LLM cutoff marked inline at 3 000 chars), full scraper log, and direct link to the Actions run
- [x] Build `POST /api/submit` route:
  - CSS-hidden honeypot field (`_trap`) — silently returns 200 on bots that autofill every field
  - "I'm not a robot" checkbox required — returns 400 if unchecked
  - HTTPS-only URL validation
  - Dispatches `submission-scraper.yml` via GitHub workflow dispatch API
  - `GITHUB_WORKFLOW_REF` env var controls which branch the workflow runs from (defaults to `"main"`; set to the feature branch for pre-merge testing)
- [x] Build `SubmitForm` component — URL input, "I'm not a robot" checkbox, CSS-hidden honeypot, loading/success/error states, optional `onSuccess` callback
- [x] Build Bounty Board page (`/bounty`):
  - Server page (`force-dynamic`) — calls `getAllIslands("live")`, skips the main connected component (index 0)
  - `← Back to graph` nav link
  - Submit form at top (any article welcome, not just gap-fillers)
  - Scrollable island list below — unit chips per island, no per-card submit buttons
- [x] Add Bounty nav link to controls bar on home page
- [x] Expand Missing Link card — adds "View Bounty Board" link and inline `SubmitForm`

### Post-launch improvements (complete)

- [x] YAML block scalar fix — multi-line PR/issue bodies rewritten using `{ echo ...; } > /tmp/body.md` + `--body-file` to avoid YAML parse errors from zero-indented content lines
- [x] Scraper log in scraper-miss issues — stderr redirected to `/tmp/scraper_log.txt`; full log (LLM responses, rejection reasons) included inline in the issue alongside the Actions run link

### Remaining

- [ ] Create GitHub labels in repo Settings: `community-submission` (#0075ca) and `scraper-miss` (#e4e669)
- [ ] Continue polish and testing on the feature branch before merging to main
