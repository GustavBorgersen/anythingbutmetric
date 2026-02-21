# Technical Specification: The Absolute Unit

**Version:** 1.0
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
| **Extraction AI** | Claude Haiku (Anthropic API) | Cheapest capable model for structured extraction; fast enough for batch scraping. |
| **CI/CD** | GitHub Actions | Free for public repos; native cron scheduling for daily scraper runs. |
| **Submission queue** | GitHub Issues | No extra infrastructure; labels provide a built-in triage workflow. |

---

## 2. Data Schema

All persistent data lives in `/data/` as two JSON files.

### 2.1 `units.json`

A flat array of unit objects.

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
| `emoji` | string | no | Single emoji character for Universe View nodes. Omit if none fits. |
| `aliases` | string[] | no | Alternative names accepted in search / extraction (e.g. plural forms). |
| `tags` | string[] | no | Optional taxonomy for clustering hints (e.g. `"animal"`, `"building"`, `"country"`). |

### 2.2 `edges.json`

A flat array of sourced comparison objects. Each object represents one directional claim from one article.

```json
[
  {
    "id": "edge_001",
    "from": "eiffel_tower",
    "to": "washington_monument",
    "factor": 6.0,
    "source_url": "https://example.com/article",
    "source_quote": "The Eiffel Tower is roughly as tall as six Washington Monuments stacked end to end.",
    "date_scraped": "2024-11-01",
    "verified": true
  }
]
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | string | yes | Unique edge identifier. Format: `edge_NNN` (zero-padded). |
| `from` | string | yes | `id` of the source unit. Must match an entry in `units.json`. |
| `to` | string | yes | `id` of the target unit. Must match an entry in `units.json`. |
| `factor` | number | yes | How many `to` units equal one `from` unit. Always positive. |
| `source_url` | string | yes | Canonical URL of the originating article. |
| `source_quote` | string | yes | The exact sentence or phrase that contains the comparison. |
| `date_scraped` | string | yes | ISO 8601 date (YYYY-MM-DD) when the edge was added. |
| `verified` | boolean | yes | `true` = accepted into the live graph. `false` = pending verification (community submissions). |

**Notes:**
- Edges are **undirected** for pathfinding purposes. The factor `f` for edge `A → B` implies `1/f` for `B → A`.
- Multiple edges between the same `from`/`to` pair are intentional and expected. They produce the Range of Uncertainty displayed in the UI.

---

## 3. Project Directory Structure

```
anythingbutmetric/
├── data/
│   ├── units.json              # Canonical unit catalogue
│   └── edges.json              # All sourced comparisons
│
├── scraper/
│   ├── scraper.py              # RSS fetch + Claude Haiku extraction
│   ├── requirements.txt        # Python dependencies
│   └── feeds.txt               # List of RSS feed URLs to monitor
│
├── src/
│   ├── app/
│   │   ├── page.tsx            # Home / converter UI
│   │   ├── universe/
│   │   │   └── page.tsx        # Universe View (force-directed graph)
│   │   ├── bounty/
│   │   │   └── page.tsx        # Missing Link Bounty Board
│   │   └── api/
│   │       ├── convert/
│   │       │   └── route.ts    # POST /api/convert — runs BFS, returns path + factors
│   │       └── submit/
│   │           └── route.ts    # POST /api/submit — creates GitHub Issue
│   │
│   ├── lib/
│   │   ├── graph.ts            # Graph construction from units.json + edges.json
│   │   ├── pathfinder.ts       # BFS implementation + factor math
│   │   └── github.ts           # GitHub Issues API client (submission queue)
│   │
│   └── components/
│       ├── UnitSelector.tsx    # Searchable dropdown component
│       ├── ResultCard.tsx      # Conversion result + range display
│       ├── EvidenceChain.tsx   # Breadcrumb trail + citations
│       └── UniverseGraph.tsx   # react-force-graph-2d wrapper
│
├── .github/
│   └── workflows/
│       └── scraper.yml         # Daily GitHub Actions cron job
│
├── Functional_Specification.md
├── Technical_Specification.md
├── Project_Roadmap.md
├── package.json
└── .env.local                  # Local secrets (never committed)
```

---

## 4. System Architecture and Data Flow

```
RSS Feeds
    │
    ▼
scraper.py (Python)
    │  Fetches headlines + summaries from feeds.txt
    │
    ▼
Claude Haiku (Anthropic API)
    │  Extracts structured comparisons from text
    │  Returns: { from, to, factor, source_quote }
    │
    ▼
edges.json + units.json  ◄──────────────────────┐
    │                                            │
    ▼                                      GitHub Issues
Next.js (server-side)                       (community submissions
    │                                        await verification,
    ├── /api/convert                         then merged to JSON)
    │     Loads graph from JSON
    │     Runs BFS pathfinder
    │     Returns path + min/max factors
    │
    ├── /api/submit
    │     Validates submission form
    │     Creates GitHub Issue via API
    │
    └── Pages (React)
          Converter UI ──► ResultCard + EvidenceChain
          Universe View ──► UniverseGraph (react-force-graph-2d)
          Bounty Board ──► list of unconnected components
```

All data is read from flat files at request time (or cached at build time for the Universe View). There is no runtime database.

---

## 5. Pathfinding Design

### 5.1 Algorithm

- **BFS (Breadth-First Search)** runs server-side in `/api/convert`.
- The graph is constructed in memory from `edges.json` on each request (or cached via Next.js `unstable_cache`).
- BFS finds the **shortest path** (fewest steps) between Source Unit and Target Unit.
- Dimensional consistency is explicitly ignored — any edge is traversable regardless of the physical quantities involved.

### 5.2 Factor Math

For a path `A → B → C`:

```
factor_AB = edge(A→B).factor         // or 1 / edge(B→A).factor if reversed
factor_BC = edge(B→C).factor

result = quantity * factor_AB * factor_BC
```

### 5.3 Range of Uncertainty

Multiple edges may exist between the same pair of nodes (different articles, different claims).

For each step in the BFS path, collect all edges between the pair:

```
min_step = min(all factors for this pair)
max_step = max(all factors for this pair)
```

Propagate across the full path:

```
result_min = quantity * (min_step_1 * min_step_2 * ... * min_step_n)
result_max = quantity * (max_step_1 * max_step_2 * ... * max_step_n)
```

If `result_min === result_max`, display as a single value. Otherwise display as "between X and Y."

---

## 6. Community Submission Pipeline

1. User submits the form at `/bounty` → POST `/api/submit`.
2. `/api/submit` validates the payload (URL parseable, factor is positive number, units exist in catalogue).
3. On validation pass, the route calls the GitHub Issues API to create a new Issue on the repo.
   - Title: `[Submission] {from_label} → {to_label}`
   - Body: structured template including URL, quote, factor.
   - Label: `submission/pending`
4. Maintainer (or automated verifier) reviews the Issue:
   - If accepted: add the edge to `edges.json`, close the Issue with label `submission/accepted`.
   - If rejected: close with label `submission/rejected` and a comment explaining why.
5. On merge to `main`, the new edge is live.

---

## 7. Environment Variables

| Variable | Used by | Description |
| :--- | :--- | :--- |
| `ANTHROPIC_API_KEY` | `scraper.py` | API key for Claude Haiku extraction calls. |
| `GITHUB_TOKEN` | `src/lib/github.ts` | Personal access token with `repo` scope, for creating Issues. |
| `GITHUB_REPO` | `src/lib/github.ts` | Target repo in `owner/repo` format (e.g. `zealotry/anythingbutmetric`). |

Store in `.env.local` for local development. Set as GitHub Actions secrets and Vercel environment variables for CI/CD and production.
