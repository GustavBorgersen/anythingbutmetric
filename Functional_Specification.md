# Functional Specification: The Anything But Metric converter

**Version:** 1.0
**Status:** Approved

---

## 1. Product Overview

**The Anything But Metric converter** is a web-based conversion engine that translates any measurement into the units journalists actually use — Double-Decker Buses, Olympic Swimming Pools, Wales, Whales, and thousands more. Rather than precise scientific conversions, the system celebrates the rich and glorious tradition of journalistic comparison, building its knowledge graph directly from real news articles.

The product is equal parts tool and toy. It answers questions like "how many Eiffel Towers tall is Mount Everest?" by finding a path through a network of absurd-but-sourced comparisons, showing the user every step of the chain, and citing every article it used to get there.

The interface is a single page. The entire knowledge graph is visible as an interactive canvas from the moment the user arrives. The conversion controls sit directly above the graph. Selecting units highlights the path through the graph in real time — the answer and its evidence emerge from the picture rather than replacing it.

---

## 2. Core Features

### 2.1 The Conversion Engine

**Purpose:** Allow a user to express any quantity in any unit in terms of any other unit, as long as a path of published comparisons exists between them.

**Input:**
- Two searchable dropdown fields: **Source Unit** and **Target Unit**.
- Both dropdowns are populated from the full catalogue of known units.
- Dropdowns support free-text search and filter results as the user types.
- A **Source Quantity** field accepts a numeric value (defaults to 1).

**Pathfinding concept:**
- The system searches the network of known comparisons to find the shortest sequence of steps connecting the Source Unit to the Target Unit.
- The system deliberately ignores dimensional consistency. If a journalist once wrote that a stadium holds the same volume of water as 10,000 elephants, that relationship is a valid step. The absurdity is the point.
- As soon as both units are selected, the path is highlighted live in the graph behind the controls. The user sees the route through the universe before they see the numbers.
- If no path exists between the two chosen units, the system returns a Missing Link error (see Section 2.4).

**Multiple routes:**
- When more than one path exists through the graph between the Source Unit and Target Unit, the system presents each route as a separate result card — like a route planner showing alternate journeys.
- Each card shows its own complete Chain of Evidence, its own intermediate units, and its own final figure. The routes may produce meaningfully different numbers, and that difference is part of the story.
- Routes are labelled by their via-point(s): "Route 1 via Football Fields," "Route 2 via Swimming Pools."

**Conflicting sources on a single step:**
- When multiple articles provide different conversion factors for the same pair of units, the system does not silently average or range them. Instead, the disagreement is surfaced explicitly within that step's citation block.
- The presentation leans into the absurdity: the UI acknowledges that journalism cannot agree, names the outlier if one exists, and lets the user see all the conflicting claims side by side.
- The system stores every unique claim and never discards a source.

---

### 2.2 The Chain of Evidence

**Purpose:** Make the system auditable and entertaining. Every result must be traceable back to a real source.

**Breadcrumb trail:**
- A result panel displays a step-by-step breakdown of the path taken.
- Each step shows the two units involved and the conversion factor applied.
- Example: `1 Eiffel Tower → 6 Washington Monuments → 40,000 Bananas`

**Source citations:**
- Each step in the chain links to the original news article that provided the comparison.
- The specific quote extracted from that article is displayed inline.
- All citation links are clickable and open the original source in a new tab.
- If a step has multiple conflicting sources, all of them are shown together for that step with a brief editorial note surfacing the disagreement.

---

### 2.3 The Graph Canvas

**Purpose:** Make the knowledge graph the primary interface — not a secondary feature to navigate to, but the first thing the user sees and the context in which all results live.

**Layout:**
- The graph canvas fills the page from the moment the user arrives.
- The conversion controls (unit dropdowns and quantity field) are positioned above the graph in a compact bar.
- The result panel appears below the controls when a conversion is active, sitting above the graph rather than replacing it. The graph remains visible and interactive at all times.

**Default state (no selection):**
- The full network is visible — all nodes and edges, freely explorable.
- The graph is zoomable and pannable. Users can browse the universe of units before making any selection.
- Each node represents one unit. Each edge represents a sourced comparison.
- Clicking a node in the default state highlights all of its direct connections.
- Clicking an edge in the default state surfaces the source article for that comparison.

**Active state (units selected):**
- The path node(s) and edge(s) are highlighted prominently.
- All non-path elements are dimmed but remain visible, preserving the sense of the wider network.
- If multiple routes exist, each route is highlighted in a distinct colour, corresponding to its result card.
- The camera pans and zooms to frame the highlighted path within the canvas.

**Visual design:**
- Nodes display an emoji or icon where one is available (e.g., 🐋 for Whales, 🏟️ for Stadiums).
- Units that are frequently compared to each other naturally cluster together.
- The interface is clean and uncluttered — no sidebars, no navigation chrome beyond what is strictly necessary.

---

### 2.4 Missing Link and Bounty Board

**Purpose:** Turn the absence of data into a community engagement opportunity.

**Missing Link error:**
- When a user requests a conversion and no path exists between the Source Unit and Target Unit, the system displays a **Missing Link** message.
- The message names the two disconnected "islands" explicitly: the cluster containing the Source Unit and the cluster containing the Target Unit.
- The user is invited to help bridge the gap.

**Bounty Board:**
- A dedicated page lists all currently unconnected islands — groups of units that have no path to the main network.
- Each entry on the Bounty Board names the isolated cluster and explains what kind of comparison would connect it.
- Example: *"No path currently exists between the Taylor Swift cluster and the Suez Canal cluster."*

**Community submission:**
- A user who knows of a published comparison can submit it via a simple form.
- The form requires:
  - A URL to the source article.
  - The specific quote or sentence containing the comparison.
  - The two units being compared.
  - The numeric factor claimed.
- Submissions enter a verification queue and are not immediately added to the graph.
- Queued submissions are reviewed (manually or by an automated verification step) before being accepted.
- Once accepted, the new edge is added to the graph and the connection appears in the graph canvas.

---

## 3. User Flows

### 3.1 Standard Conversion Flow

1. User lands on the home page. The full graph canvas is immediately visible and explorable.
2. User selects a Source Unit from the dropdown (e.g., "Blue Whale"). The selected node highlights in the graph.
3. User selects a Target Unit from the dropdown (e.g., "Double-Decker Bus"). The path between the two nodes lights up in the graph immediately — no button press required.
4. The result panel appears below the controls. One result card is shown per available route, each labelled by its via-point(s) and colour-matched to its highlighted path in the graph.
5. User adjusts the quantity (optional; defaults to 1). Result figures update in place.
6. Each card contains the final figure and its own Chain of Evidence breadcrumb trail.
7. Where sources conflict on a step, the card surfaces the disagreement inline with editorial commentary.
8. User can click any citation link to read the original source article (opens in a new tab).
9. User can clear the selection to return the graph to its default browsable state.

### 3.2 Missing Link Submission Flow

1. User attempts a conversion where no path exists.
2. System displays the Missing Link error, naming the two disconnected islands.
3. User clicks **Submit a Link** (or navigates to the Bounty Board).
4. User locates the relevant Bounty Board entry for their units.
5. User clicks **Submit a Source** on that entry.
6. User fills in the submission form: URL, quote, units, and factor.
7. System confirms submission and explains that it will be reviewed before going live.
8. Once verified and accepted, the connection appears in the graph and the Bounty Board entry is resolved.

---

## 4. UI Rules

- **Searchable dropdowns:** Both unit selectors support free-text filtering. Results update as the user types. No scrolling through an unsorted list.
- **Quantity input:** Accepts whole numbers and decimals. Negative values and zero are rejected with an inline validation message.
- **Multiple routes:** When alternate paths exist through the graph, each is shown as its own result card with its own label and Chain of Evidence. Cards are ordered shortest path first.
- **Conflicting sources:** Surfaced inline within the relevant step, not collapsed into a range. The disagreement is presented with a light editorial tone — the product acknowledges the chaos rather than smoothing it over.
- **Single page:** The graph canvas, conversion controls, and result panel all live on one page. Nothing navigates away except external citation links.
- **Path highlighting triggers on second selection:** No Convert button. The moment both units are chosen the path lights up and the result panel appears.
- **Colour correspondence:** Each route's highlight colour in the graph matches the accent colour of its result card, so the connection between visual and textual is immediate.
- **Camera behaviour:** When a path is highlighted, the graph auto-pans and zooms to frame it. The user can still scroll/pan freely from there.
- **Clickable citations:** Every source link opens the original article in a new browser tab. The graph and result panel remain undisturbed.
- **Graph always interactive:** Dimmed nodes and edges in the active state are still clickable. Clicking a dimmed node in active state shows its connections without clearing the current conversion.
- **Missing Link state:** Clearly differentiated from an error state. The user should understand this is a known gap, not a bug. The two disconnected islands are each highlighted in the graph to show why no path can be drawn.
- **Bounty Board:** Sorted by how many users have attempted the missing conversion (most-wanted at the top), if that data is available. Otherwise sorted alphabetically.
- **Node legibility:** Nodes must be legible at default zoom. Emoji fallback to a text label if no emoji is available for a unit.
