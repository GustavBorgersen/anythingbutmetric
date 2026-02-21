# Technical Specification: The Anything But Metric converter

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
| `emoji` | string | no | Single emoji character for graph canvas nodes. Omit if none fits. |
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
- Multiple edges between the same `from`/`to` pair are intentional and expected. They are surfaced as conflicting sources within the relevant step of the Chain of Evidence.

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
│   │   ├── page.tsx            # Home — graph canvas + conversion controls + result panel
│   │   ├── bounty/
│   │   │   └── page.tsx        # Missing Link Bounty Board
│   │   └── api/
│   │       ├── convert/
│   │       │   └── route.ts    # POST /api/convert — runs BFS, returns all routes
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
│       ├── GraphCanvas.tsx     # react-force-graph-2d wrapper; accepts highlight state
│       ├── ResultCard.tsx      # Single route result + Chain of Evidence
│       └── EvidenceChain.tsx   # Breadcrumb trail + citations
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
    │     Runs BFS for all shortest paths
    │     Returns all routes + per-step conflict data
    │
    ├── /api/submit
    │     Validates submission form
    │     Creates GitHub Issue via API
    │
    └── Pages (React)
          Home page ──► GraphCanvas (full-page) + UnitSelector controls
                    ──► ResultCard + EvidenceChain (appear on second selection)
          Bounty Board ──► list of unconnected components
```

All data is read from flat files at request time. The full graph data for `GraphCanvas` is fetched once on page load and held in client state. There is no runtime database.

---

## 5. Pathfinding Design

### 5.1 Algorithm

- **BFS (Breadth-First Search)** runs server-side in `/api/convert`.
- The graph is constructed in memory from `edges.json` on each request (or cached via Next.js `unstable_cache`).
- BFS finds **all shortest paths** (same minimum step count) between Source Unit and Target Unit, not just the first one encountered.
- Each distinct path through different intermediate nodes is returned as a separate route.
- Dimensional consistency is explicitly ignored — any edge is traversable regardless of the physical quantities involved.

### 5.2 Factor Math

For a path `A → B → C`:

```
factor_AB = edge(A→B).factor         // or 1 / edge(B→A).factor if reversed
factor_BC = edge(B→C).factor

result = quantity * factor_AB * factor_BC
```

Each route produces its own independent result value using this formula.

### 5.3 Multiple Routes

When BFS finds more than one shortest path, the API returns all of them as an ordered array of route objects. Routes are ordered by path length (ascending), with ties broken arbitrarily.

Each route object in the response:

```
{
  "routeIndex": 0,                     // 0-based; used to match result card colour to graph highlight
  "label": "via Football Fields",      // constructed from intermediate node labels
  "result": 847,                       // computed result for this route
  "nodeIds": ["blue_whale", "football_field", "double_decker_bus"],  // ordered path for graph highlight
  "edgeIds": ["edge_012", "edge_047"],                               // edges to highlight in graph
  "steps": [                           // the Chain of Evidence for this route
    {
      "from": "blue_whale",
      "to": "football_field",
      "factor": 3.2,
      "sources": [ ... ]               // all edges for this pair (see 5.4)
    },
    ...
  ]
}
```

`nodeIds` and `edgeIds` are passed directly to `GraphCanvas` to drive the highlight state. The `routeIndex` is used to assign a consistent colour across the result card and the corresponding graph highlight — index 0 gets colour 0, index 1 gets colour 1, and so on.

The UI renders one result card per route. If only one route exists, a single card is shown with no route label or colour accent needed.

**Reactive trigger:** `/api/convert` is called automatically when the second unit is selected in the UI — there is no explicit Convert button. The request fires on the `onChange` of the second dropdown (or immediately if the second field is filled first).

### 5.4 Conflicting Sources on a Step

Multiple edges may exist between the same pair of nodes (different articles, different claims). These are not averaged or collapsed — all are passed to the client.

For each step, collect all edges between the pair:

```
sources = all edges where (from === A and to === B) or (from === B and to === A)
```

The response includes the full `sources` array for every step. The UI is responsible for rendering the disagreement with appropriate editorial commentary. The primary `factor` used for the route's result computation is the factor from the most recently scraped source (newest `date_scraped`).

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
