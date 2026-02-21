# Functional Specification: The Absolute Unit

**Version:** 1.0
**Status:** Approved

---

## 1. Product Overview

**The Absolute Unit** is a web-based conversion engine that translates any measurement into the units journalists actually use — Double-Decker Buses, Olympic Swimming Pools, Wales, Whales, and thousands more. Rather than precise scientific conversions, the system celebrates the rich and glorious tradition of journalistic comparison, building its knowledge graph directly from real news articles.

The product is equal parts tool and toy. It answers questions like "how many Eiffel Towers tall is Mount Everest?" by finding a path through a network of absurd-but-sourced comparisons, showing the user every step of the chain, and citing every article it used to get there.

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
- If no path exists between the two chosen units, the system returns a Missing Link error (see Section 2.4).

**Range of Uncertainty:**
- Real-world journalism is inconsistent. Multiple articles may claim different conversion factors for the same two units.
- The system stores every unique claim.
- When multiple conflicting claims exist for any step in the chain, the result is displayed as a **range**: a minimum value and a maximum value rather than a single number.
- This range propagates across the whole chain — the final result is presented as "between X and Y [Target Units]."

---

### 2.2 The Chain of Evidence

**Purpose:** Make the system auditable and entertaining. Every result must be traceable back to a real source.

**Breadcrumb trail:**
- The result page displays a step-by-step breakdown of the path taken.
- Each step shows the two units involved and the conversion factor applied.
- Example: `1 Eiffel Tower → 6 Washington Monuments → 40,000 Bananas`

**Source citations:**
- Each step in the chain links to the original news article that provided the comparison.
- The specific quote extracted from that article is displayed inline.
- All citation links are clickable and open the original source in a new tab.
- If a step has multiple conflicting sources (producing the range of uncertainty), all conflicting sources are shown together for that step.

---

### 2.3 Universe View

**Purpose:** Provide an explorable, visual overview of the entire knowledge graph — every unit the system knows about and every connection between them.

**Behaviour:**
- The Universe View is a dedicated page showing the full network as an interactive graph.
- The graph is zoomable and pannable — users can navigate freely.
- Each node in the graph represents one unit (e.g., Blue Whale, Football Field, Wales).
- Each edge in the graph represents a sourced comparison between two units.

**Visual design:**
- Nodes display an emoji or icon where one is available (e.g., 🐋 for Whales, 🏟️ for Stadiums).
- Units that are frequently compared to each other naturally cluster together due to the force-directed layout.
- Clicking a node highlights all its direct connections.
- Clicking an edge surfaces the source article for that comparison.

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
- Once accepted, the new edge is added to the graph and the connection appears in the Universe View.

---

## 3. User Flows

### 3.1 Standard Conversion Flow

1. User lands on the home page.
2. User selects a Source Unit from the dropdown (e.g., "Blue Whale").
3. User selects a Target Unit from the dropdown (e.g., "Double-Decker Bus").
4. User enters a quantity (optional; defaults to 1).
5. User clicks **Convert**.
6. System displays the result: the equivalent quantity in Target Units, presented as a range if multiple conflicting sources exist.
7. Below the result, the Chain of Evidence breadcrumb trail is displayed.
8. User can click any citation link to read the original source article.
9. User can click **Universe View** to explore the full graph.

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
- **Result display:** Always shown as a range (min / max) when conflicting sources exist. When only one source exists, min and max are equal and displayed as a single value.
- **Clickable citations:** Every source link opens the original article in a new browser tab. No link ever navigates the user away from the result page.
- **Missing Link state:** Clearly differentiated from an error state. The user should understand this is a known gap, not a bug.
- **Bounty Board:** Sorted by how many users have attempted the missing conversion (most-wanted at the top), if that data is available. Otherwise sorted alphabetically.
- **Universe View accessibility:** Nodes must be legible at default zoom. Emoji fallback to a text label if no emoji is available for a unit.
