# Technical Specification: The Anything But Metric converter

**Version:** 1.4
**Status:** Locked

---

## 1. Tech Stack (Locked)

| Layer | Technology | Justification |
| :--- | :--- | :--- |
| **Frontend framework** | Next.js (React) | App Router enables server-side pathfinding without a separate API server; Vercel deploy is trivial. |
| **Hosting** | Vercel | Zero-config deployment for Next.js; free tier sufficient for launch. |
| **Data store** | Flat JSON files in repo | Eliminates database infrastructure for v1; git history doubles as an audit log. |
| **Graph library** | react-force-graph-2d | Purpose-built for force-directed graphs in React; handles large node counts with canvas rendering. |
| **Scraper runtime** | Python 3.x | Mature HTTP + parsing ecosystem; GitHub Actions native support. |
| **Primary extraction LLM** | Groq (Llama 3.3 70B Versatile) | Fast inference, generous free-tier RPM; used first on every article. Stronger instruction following and JSON schema adherence than smaller models. |
| **Fallback extraction LLM** | Gemini Flash (Google AI API) | Falls back to Gemini when Groq quota is exhausted; native JSON output mode. |
| **Article fetcher** | trafilatura + Jina Reader | trafilatura handles direct HTTP; Jina Reader (headless browser API) covers JS-rendered pages. |
| **CI/CD** | GitHub Actions | Free for public repos; native cron scheduling for daily scraper runs. |
| **Submission queue** | GitHub Issues | No extra infrastructure; labels provide a built-in triage workflow. |

---

## 2. Data Schema

Persistent data lives in `/data/` as four JSON files — two frozen seed files and two live files grown by the scraper.

### 2.1 File layout

```
data/
  seed-units.json   ← frozen, hand-crafted; never written by automation
  seed-edges.json   ← frozen, hand-crafted (all verified: true)
  units.json        ← live; starts as copy of seed-units.json; grown by scraper PRs
  edges.json        ← live; starts as []; grown by scraper PRs
```

The scraper writes only to `units.json` and `edges.json`. The seed files are the authoritative demo dataset and are never modified by automated processes.

### 2.2 Unit object (`units.json` / `seed-units.json`)

```json
[
  {
    "id": "blue_whale",
    "label": "Blue Whale",
    "emoji": "🐋",
    "aliases": ["whale", "blue whales"],
    "tags": ["animal", "marine"]
  }
]
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | string | yes | Unique slug. Lowercase, underscores. Used as the primary key across both files. |
| `label` | string | yes | Display name shown in the UI. |
| `emoji` | string | no | Single emoji character for graph canvas nodes. Omit if none fits. |
| `aliases` | string[] | no | Alternative names matched during extraction (plurals, common shorthand, article phrasing). The more aliases, the less likely the scraper is to create a duplicate unit. |
| `tags` | string[] | no | Optional taxonomy for clustering hints (e.g. `"animal"`, `"building"`, `"country"`). |

### 2.3 Edge object (`edges.json` / `seed-edges.json`)

```json
[
  {
    "id": "e001",
    "from": "eiffel_tower",
    "to": "washington_monument",
    "factor": 6.0,
    "source_url": "https://example.com/article",
    "source_quote": "The Eiffel Tower is roughly as tall as six Washington Monuments stacked end to end.",
    "date_scraped": "2026-02-01",
    "verified": false
  }
]
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | string | yes | Unique edge identifier. Format: `eNNN` (zero-padded). |
| `from` | string | yes | `id` of the source unit. Must match an entry in `units.json`. |
| `to` | string | yes | `id` of the target unit. Must match an entry in `units.json`. |
| `factor` | number | yes | How many `to` units equal one `from` unit. Always positive. |
| `source_url` | string | yes | Canonical URL of the originating article. |
| `source_quote` | string | yes | The exact sentence or phrase that contains the comparison. |
| `date_scraped` | string | yes | ISO 8601 date (YYYY-MM-DD) when the edge was added. |
| `verified` | boolean | yes | Metadata only. Seed edges use `true`; scraper-produced edges use `false`. Does not gate pathfinding — all edges in both files are used. Merging the scraper PR is the human review step. |

**Notes:**
- Edges are **undirected** for pathfinding purposes. The factor `f` for edge `A → B` implies `1/f` for `B → A`.
- Multiple edges between the same `from`/`to` pair are intentional and expected. They are surfaced as conflicting sources within the relevant step of the Chain of Evidence.

---

## 3. Project Directory Structure

```
anythingbutmetric/
├── data/
│   ├── seed-units.json         # Frozen hand-crafted units (never written by automation)
│   ├── seed-edges.json         # Frozen hand-crafted edges (never written by automation)
│   ├── units.json              # Live unit catalogue (seed + scraper additions)
│   └── edges.json              # Live comparisons (scraper additions only; starts as [])
│
├── scraper/
│   ├── scraper.py              # RSS fetch + LLM extraction pipeline
│   ├── requirements.txt        # Python dependencies
│   └── feeds.txt               # RSS feed URLs + direct article URLs to monitor
│
├── src/
│   ├── app/
│   │   ├── page.tsx            # Home — reads all 4 JSON files, passes to HomeClient
│   │   ├── bounty/
│   │   │   └── page.tsx        # Bounty Board — force-dynamic; calls getAllIslands("live")
│   │   └── api/
│   │       ├── convert/
│   │       │   └── route.ts    # POST /api/convert — runs BFS, returns all routes
│   │       └── submit/
│   │           └── route.ts    # POST /api/submit — validates URL, dispatches submission-scraper.yml
│   │
│   ├── lib/
│   │   ├── types.ts            # Unit, Edge, Step, Route, ConvertRequest, GraphData, HighlightState
│   │   ├── constants.ts        # ROUTE_COLOURS (5 colours, 0-indexed)
│   │   ├── graph.ts            # Two caches (_seed, _live); mode-aware loaders; getAllIslands()
│   │   └── pathfinder.ts       # BFS all-shortest-paths; mode param threaded through
│   │
│   └── components/
│       ├── HomeClient.tsx      # Mode state; Demo/Live toggle; Bounty link; Missing Link CTA
│       ├── UnitSelector.tsx    # Searchable dropdown (only units with edges shown)
│       ├── GraphCanvas.tsx     # Dynamic import wrapper (SSR disabled)
│       ├── GraphCanvasInner.tsx # react-force-graph-2d canvas; filters isolated nodes
│       ├── ResultCard.tsx      # Single route result + Chain of Evidence
│       ├── EvidenceChain.tsx   # Breadcrumb trail + citations
│       ├── BountyClient.tsx    # Bounty Board UI — scrollable island list
│       └── SubmitForm.tsx      # Reusable article submission form (honeypot + checkbox)
│
├── .github/
│   └── workflows/
│       ├── scraper.yml                # Daily cron + workflow_dispatch with clear_scraped input
│       └── submission-scraper.yml     # workflow_dispatch on article_url; opens PR or scraper-miss issue
│
├── doc/
│   ├── Functional_Specification.md
│   ├── Technical_Specification.md
│   └── Project_Roadmap.md
│
├── package.json
└── .env.local                  # Local secrets (never committed)
```

---

## 4. System Architecture and Data Flow

```
RSS Feeds + direct article URLs (feeds.txt)
    │
    ▼
scraper.py (Python, GitHub Actions daily cron)
    │  Fetches article text via trafilatura / Jina Reader
    │  Deduplicates against existing source URLs in edges.json
    │
    ▼
Groq (Llama) — primary LLM
    │  Falls back to Gemini Flash if Groq quota exhausted
    │  Prompt instructs: match known units by id/label/alias; return new-unit
    │  objects for genuinely new things; strict rules on what counts as a comparison
    │
    ▼
resolve_unit()
    │  terms_to_id lookup: id + label + aliases (lowercased) → canonical unit id
    │  Prevents duplicate units when LLM returns a label/alias instead of the id
    │  Unknown string ids synthesised into minimal new unit objects
    │
    ▼
units.json + edges.json  (scraper PR opened when NEW_EDGES > 0)
    │                          │
    │                    Human review
    │                    (merge PR = approval;
    │                     verified flag is metadata only)
    │
    ▼
Next.js (server-side)
    │  Reads all 4 JSON files at request time
    │  Two in-memory caches: _seed (seed-*.json) and _live (units/edges.json)
    │
    ├── /api/convert  (mode: 'seed' | 'live', default 'live')
    │     Loads graph from appropriate cache
    │     Runs BFS for all shortest paths
    │     Returns all routes + per-step conflict data
    │
    ├── /api/submit
    │     Honeypot check → silent 200 on bots
    │     Checkbox + HTTPS URL validation → 400 on bad input
    │     Dispatches submission-scraper.yml via GitHub workflow dispatch API
    │     GITHUB_WORKFLOW_REF controls target branch (default: "main")
    │
    ├── /bounty  (force-dynamic server page)
    │     Calls getAllIslands("live") → string[][]
    │     Passes disconnected islands (index 1+) to BountyClient
    │
    └── HomeClient (React, client-side)
          Demo/Live toggle → activeUnits + activeEdges
          Units with no edges filtered from selectors and graph
          UnitSelector × 2 + GraphCanvas + ResultCard + EvidenceChain
          Missing Link card includes SubmitForm + Bounty Board link

User submits article URL (via /bounty or Missing Link card)
    │
    ▼
POST /api/submit → GitHub workflow dispatch API
    │
    ▼
submission-scraper.yml (GitHub Actions, workflow_dispatch)
    │  Runs scraper --url in single-URL mode
    │  Stderr (debug log) → /tmp/scraper_log.txt
    │  Stdout (NEW_EDGES=N) → GITHUB_OUTPUT
    │
    ├── NEW_EDGES > 0 → branch submission/YYYY-MM-DD-{hash}
    │                   PR labelled community-submission
    │                   (human reviews and merges)
    │
    └── NEW_EDGES = 0 → issue labelled scraper-miss
                        includes: scraper log, article text with LLM cutoff marked,
                        link to Actions run
```

---

## 5. Pathfinding Design

### 5.1 Algorithm

- **BFS (Breadth-First Search)** runs server-side in `/api/convert`.
- The graph is constructed in memory from the appropriate JSON files on first request, then cached per mode (`_seed` or `_live`).
- BFS finds **all shortest paths** (same minimum step count) between Source Unit and Target Unit, not just the first one encountered.
- Each distinct path through different intermediate nodes is returned as a separate route.
- Dimensional consistency is explicitly ignored — any edge is traversable regardless of the physical quantities involved.
- All edges in the active dataset are used for pathfinding regardless of the `verified` flag.

### 5.2 Factor Math

For a path `A → B → C`:

```
factor_AB = edge(A→B).factor         // or 1 / edge(B→A).factor if reversed
factor_BC = edge(B→C).factor

result = quantity * factor_AB * factor_BC
```

Each route produces its own independent result value using this formula.

### 5.3 Multiple Routes

When BFS finds more than one shortest path, the API returns all of them as an ordered array of route objects (capped at 5). Routes are ordered by path length (ascending), with ties broken arbitrarily.

Each route object in the response:

```
{
  "routeIndex": 0,
  "label": "via Football Fields",
  "result": 847,
  "nodeIds": ["blue_whale", "football_field", "double_decker_bus"],
  "edgeIds": ["e012", "e047"],
  "steps": [
    {
      "fromId": "blue_whale",
      "toId": "football_field",
      "factor": 3.2,
      "edges": [ ... ]      // all edges for this pair (for conflict display)
    },
    ...
  ]
}
```

`nodeIds` and `edgeIds` are passed directly to `GraphCanvas` to drive the highlight state. The `routeIndex` assigns a consistent colour across the result card and the corresponding graph highlight.

### 5.4 Conflicting Sources on a Step

Multiple edges may exist between the same pair of nodes. These are not averaged or collapsed — all are passed to the client in the `edges` array of each step. The UI renders the disagreement with editorial commentary. The `factor` used for the route's result computation is taken from the primary edge found by BFS.

---

## 6. Scraper Pipeline Detail

### 6.1 Article processing

1. Parse `feeds.txt` — feedparser fetches each line. If it returns entries, it's an RSS feed. If feedparser recognised a valid feed format (`feed.version` non-empty) but found no entries, the line is skipped. If the feed URL returned an HTTP error (4xx/5xx), it is skipped with a warning. If feedparser returned no entries and detected no feed format at all, the line is treated as a direct article URL (the intended use-case for non-RSS URLs in `feeds.txt`).
2. Skip any entry whose URL already appears in `edges.json` (dedup by source URL).
3. Skip any entry older than `--max-age-hours` (default: **26 h** — 2 h above the 24 h cron cadence). Age is computed from feedparser's `published_parsed` field, falling back to `updated_parsed`. Entries with no publication date are always processed. Set to `0` to disable the filter (useful when backfilling a newly added feed).
4. Fetch full article text via **trafilatura** (direct HTTP GET). If trafilatura returns less than 200 chars, fall back to **Jina Reader** (headless browser API).
4. Truncate to **4,000 characters** (journalistic comparisons appear in ledes and early paragraphs; the back half of articles is typically boilerplate and noise) and call the LLM with the extraction prompt.
5. For each comparison returned, apply structural validation and hard code-level filters (see §6.5 below).
6. Call `resolve_unit()` on `from` and `to` for each comparison that passes.
7. Build edge objects; dedup by `(from, to, factor, source_url)`; append to accumulator (capped at **3 edges per article** — more than 3 valid comparisons from one article almost always signals the model is fishing).

### 6.2 Unit resolution

`resolve_unit()` handles three cases in order:

1. **Known string id** — exact match in `existing_unit_ids` → return as-is.
2. **Unknown string id** — check `terms_to_id` (lowercased id/label/alias lookup of all existing units). If matched, return the canonical id. Otherwise synthesise a minimal new unit `{id, label, aliases: [human-readable form]}`.
3. **New unit object** — check label and aliases against `terms_to_id` first (may match an existing unit). If no match and id already in `new_units_map` (same unit referenced twice in one article), return that id. Otherwise create a new unit, deduplicating the id against existing unit ids only.

After `resolve_unit()`, two additional guards run before the edge is accepted:
- **Self-referential guard** — edges where `from_id == to_id` are always discarded.
- **Both-sides-new guard** — edges where both `from` and `to` are units created during this run are discarded when the `--filter-both-new` flag is set (off by default). Recommended once the unit catalogue is large; in the early stages the catalogue is small enough that new-to-new edges can be legitimate.

### 6.3 PR and review

When `NEW_EDGES > 0`, the workflow:
1. Creates branch `scraper/YYYY-MM-DD`
2. Commits `data/edges.json` and `data/units.json`
3. Opens a PR. If a PR for that branch already exists, skips creation (uses `gh pr create ... || echo "already exists"`).

Merging the PR is the human review step. The `verified: false` flag on scraper edges is metadata — it does not gate pathfinding.

### 6.4 Extraction prompt design

The extraction prompt is the primary quality gate. Key design choices:

- **GOOD / BAD example pairs** — 4 canonical good examples (iceberg/Wales, whale/buses, etc.) plus 13 explicit bad examples drawn from real failure modes, each labelled with the reason for rejection (raw measurement, duration, power output, probability, monetary value, purity multiplier, etc.).
- **Rule 2 (physical objects)** — explicitly lists whole categories of invalid `from`/`to`: time periods, speed/power, monetary values, probabilities, abstract quantities, purity/efficiency multipliers, and things that are themselves units of measurement ("tonne", "metre").
- **Rule 3 (comparative phrases)** — only four exact forms are accepted. Ambiguous forms like "times more", "times purer", and bare "as much as" are explicitly rejected.
- **Rule 5 (reusable units)** — both sides must be physical objects that could plausibly appear in multiple different articles. Article-specific one-offs (e.g. "salmon farm production in 2018") must be rejected even if they pass the other rules.
- **Calibrated doubt** — the prompt explicitly states that ~80% of articles contain no valid comparison and that returning `[]` is the correct and expected output.

### 6.5 Code-level quality filters

The prompt is the primary gate; the following code-level checks are a secondary enforcement layer that is independent of the LLM:

| Filter | Location | What it catches |
| :--- | :--- | :--- |
| **Keyword pre-filter** | `validate_comparison()` | `source_quote` must contain at least one of 17 hard comparison phrases (e.g. "the size of", "times the size", "times smaller than", "as heavy as"). Rejects quotes with no recognisable comparative language. |
| **Self-referential guard** | `process_article()` | Discards edges where `from_id == to_id`. |
| **Both-sides-new guard** | `process_article()` | Discards edges where both `from` and `to` are units newly created in the current run. **Off by default** — enable with `--filter-both-new` (CLI) or the matching workflow checkbox. Recommended once the unit catalogue is large enough that new-to-new edges are unlikely to connect to the main graph. |
| **Per-article cap** | `process_article()` | Stops accepting edges after 3 are collected from a single article. |

### 6.6 Logging

Normal runs log one header line and one result line per feed, then a final totals line:

```
06:00:01 INFO  Loaded 31 units, 47 edges
06:00:01 INFO  Processing 15 feeds
06:00:01 INFO  Feed 1/15: https://feeds.bbci.co.uk/news/science_and_environment/rss.xml
06:00:09 INFO    20 entries | 3 processed, 12 old, 5 seen | +2 edges, +0 units
...
06:05:00 INFO  Done: +7 edges, +2 units
```

Real errors (quota exhaustion, HTTP errors, LLM JSON parse failures) surface as `WARNING`. Per-article detail (fetch strategy, rate-limit sleeps, LLM call results, unit resolution) is written at `DEBUG` level and hidden by default. Pass `-v` / `--verbose` to restore full debug output. `--url` mode always enables verbose automatically.

### 6.7 Workflow dispatch inputs

`workflow_dispatch` exposes three inputs:

| Input | Type | Default | Effect |
| :--- | :--- | :--- | :--- |
| `clear_scraped` | boolean | false | Resets `edges.json` to `[]` and restores `units.json` from seed before running. Use for full test resets. |
| `filter_both_new` | boolean | false | Passes `--filter-both-new` to the scraper. Recommended once the unit catalogue is large. |
| `max_age_hours` | number | 26 | Passes `--max-age-hours` to the scraper. Set to `0` to disable age filtering and backfill an entire feed's history. |

---

## 7. UI Mode System

The UI has two modes, toggled by a pill button ("Demo" / "Live") in the controls bar.

| | Demo | Live |
|:---|:---|:---|
| Units source | `seed-units.json` | `units.json` |
| Edges source | `seed-edges.json` | `edges.json` |
| API `mode` param | `"seed"` | `"live"` |
| Default | No | Yes |

Switching mode resets the selected units (stale ids may not exist in the other dataset). Both unit selectors and the graph canvas filter to only show units that have at least one edge in the active dataset.

---

## 8. Environment Variables

| Variable | Used by | Where to set | Description |
| :--- | :--- | :--- | :--- |
| `GROQ_API_KEY` | `scraper.py` | GitHub Actions secret | API key for Groq (Llama) — primary extraction LLM. |
| `GOOGLE_AI_API_KEY` | `scraper.py` | GitHub Actions secret | API key for Gemini Flash — fallback extraction LLM. |
| `GITHUB_PAT` | `/api/submit` | Vercel + `.env.local` | Fine-grained PAT with **Actions: read and write** permission. Used to dispatch `submission-scraper.yml`. |
| `GITHUB_REPO_OWNER` | `/api/submit` | Vercel + `.env.local` | GitHub repository owner (e.g. `GustavBorgersen`). |
| `GITHUB_REPO_NAME` | `/api/submit` | Vercel + `.env.local` | GitHub repository name (e.g. `anythingbutmetric`). |
| `GITHUB_WORKFLOW_REF` | `/api/submit` | Vercel (preview only) | Branch ref passed to the workflow dispatch API. Defaults to `"main"` when unset. Set to the feature branch name in Vercel preview deployments to test before merging. |

Store `GITHUB_PAT`, `GITHUB_REPO_OWNER`, and `GITHUB_REPO_NAME` in `.env.local` for local development. `GROQ_API_KEY` and `GOOGLE_AI_API_KEY` are GitHub Actions secrets only (the scraper never runs locally in production mode).
