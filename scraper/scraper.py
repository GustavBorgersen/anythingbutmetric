#!/usr/bin/env python3
"""
Anything But Metric — daily scraper.

Fetches RSS feeds, extracts journalistic unit comparisons via Gemini Flash,
and appends new edges (verified=false) to data/edges.json.

Exits with code 0 always; prints NEW_EDGES=<n> so GitHub Actions can
detect whether a PR is needed.
"""

import argparse
import calendar
import json
import logging
import os
import re
import sys
import time
import warnings
from datetime import date
from pathlib import Path

import feedparser
import requests
import trafilatura
from bs4 import BeautifulSoup

# Suppress google-generativeai deprecation noise
warnings.filterwarnings("ignore")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths (resolved relative to this file, which sits next to the repo root)
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).parent.parent
UNITS_FILE = REPO_ROOT / "data" / "units.json"
EDGES_FILE = REPO_ROOT / "data" / "edges.json"
FEEDS_FILE = Path(__file__).parent / "feeds.txt"

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
FETCH_TIMEOUT = 15          # seconds for raw HTML requests
JINA_TIMEOUT = 30           # seconds for Jina Reader (headless browser, needs more time)
GROQ_MODEL = "llama-3.3-70b-versatile"
GROQ_RPM = 25               # free tier allows 30 RPM; stay a little under
GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_RPM = 5              # free-tier requests per minute; enforced with sleep
DEFAULT_MAX_AGE_HOURS = 26  # skip RSS entries older than this; 0 = no filter

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_json(path: Path) -> list:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data: list) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def slugify(label: str) -> str:
    """Convert a label to a snake_case id."""
    s = label.lower()
    s = re.sub(r"[^\w\s]", "", s)
    s = re.sub(r"\s+", "_", s.strip())
    s = re.sub(r"_+", "_", s)
    return s


def fetch_article_text(url: str) -> str | None:
    """Fetch article plain text via trafilatura (primary) or Jina Reader (fallback).

    Returns None if both strategies fail; caller falls back to RSS summary.
    """
    # 1. trafilatura — direct HTTP GET; smart local extraction, zero external API calls
    try:
        resp = requests.get(
            url,
            headers={"User-Agent": "AnythingButMetric-Scraper/1.0"},
            timeout=FETCH_TIMEOUT,
        )
        if resp.ok:
            result = trafilatura.extract(resp.content)
            if result and len(result) > 200:
                log.debug("  fetch: trafilatura OK (%d chars)", len(result))
                return result
            log.debug("  fetch: trafilatura got no content — trying Jina")
        else:
            log.debug("  fetch: trafilatura HTTP %s — trying Jina", resp.status_code)
    except Exception as exc:
        log.debug("  fetch: trafilatura error (%s) — trying Jina", exc)

    # 2. Jina Reader — external API, headless browser for JS-rendered pages
    try:
        resp = requests.get(
            f"https://r.jina.ai/{url}",
            headers={
                "X-Return-Format": "text",
                "User-Agent": "AnythingButMetric-Scraper/1.0",
            },
            timeout=JINA_TIMEOUT,
        )
        if resp.ok:
            text = resp.text.strip()
            if len(text) > 200:
                log.debug("  fetch: Jina OK (%d chars)", len(text))
                return text
            log.debug("  fetch: Jina too little text (%d chars)", len(text))
        else:
            log.debug("  fetch: Jina HTTP %s", resp.status_code)
    except Exception as exc:
        log.debug("  fetch: Jina error (%s)", exc)

    return None


def build_units_prompt_block(units: list[dict]) -> str:
    """Compact JSON list of known units for the prompt."""
    simplified = [
        {"id": u["id"], "label": u["label"], "aliases": u.get("aliases", [])}
        for u in units
    ]
    return json.dumps(simplified, ensure_ascii=False)


EXTRACTION_PROMPT_TEMPLATE = """\
You are extracting journalistic unit comparisons from a news article.

A journalistic unit comparison uses something UNFAMILIAR to help the reader picture scale by \
comparing it to something FAMILIAR and PHYSICAL. The reader should finish the sentence with a \
clearer mental image of the size, weight, area, or volume being described.

GOOD examples — these are valid comparisons:
  "The iceberg is a quarter the size of Wales."
  "Scientists discovered a deposit 3 times the size of Wales."
  "The whale weighs as much as 30 double-decker buses."
  "The Great Barrier Reef is the size of 70 million football pitches."

BAD examples — these are NOT comparisons; return [] for articles that only contain these:
  "The temperature rose by 2.5°C."              ← raw statistic; no reference object
  "The mission lasted 9 months."                ← duration, not a size comparison
  "The rocket rose 80 feet into the air."       ← raw measurement with no reference object
  "The turbine generates 2-3 megawatts."        ← power output, not physical scale
  "One lunar day equals four weeks on Earth."   ← time period, not physical
  "It's more likely than winning the lottery."  ← probability, not physical scale
  "The factory is microwave-sized."             ← appearance/shape, not a numeric scale comparison
  "Semiconductors 4,000 times purer."           ← quality/purity, not physical size
  "Produced 38,000 tonnes of salmon."           ← raw quantity with its own unit; no reference object
  "The base is 20 miles from the Estate."       ← distance measurement, no familiar reference
  "Each nest costs €500."                       ← monetary value
  "1 in 4 properties face flood risk."          ← ratio/proportion; no physical unit
  "The asteroid is 500 million years old."      ← age; not compared to a relatable unit

Known units (use their exact `id` when you recognise them):
{units_block}

Article text:
---
{article_text}
---

Return a JSON array of comparison objects found in the article. Each object must be:
{{
  "from": <string id OR new-unit object>,
  "to": <string id OR new-unit object>,
  "factor": <positive number — how many `to` per one `from`>,
  "source_quote": "<verbatim sentence from the article>"
}}

Hard rules — a comparison is only valid when ALL of the following are true:
1. `from` and `to` are DIFFERENT things — never the same unit compared to itself.
2. Both `from` and `to` are physical, tangible, visualisable things. The following
   are NEVER valid — reject any comparison involving:
   - Time periods (days, weeks, years, centuries)
   - Speed or power (mph, megawatts, horsepower)
   - Monetary values or costs (£, $, €, billion, budget)
   - Probabilities or ratios (likelihood, percentage, "1 in X")
   - Abstract quantities (number of samples, number of properties, production totals)
   - Purity, efficiency, or quality multipliers ("X times purer/faster/stronger")
   - Things that are units of measurement themselves ("tonne", "metre", "kilometre")
3. The source_quote contains explicit size/weight/area/volume comparative language.
   The ONLY accepted forms are:
   - "[X] times the size/area/weight/height/length/volume of [Y]"
   - "[X] is as big/heavy/tall/wide/long as [Y]"
   - "[X] equivalent to [Y]" (where both X and Y are physical objects)
   - "[X] the size of [Y]" / "the size of [X]"
   - "times larger than" / "times bigger than" (only for physical size)
   Phrases like "times more", "times faster", "times purer", "as much as" (for
   probability or quantity), "times the output/production" do NOT qualify.
4. The comparison helps a reader visualise scale — the familiar unit gives an intuitive
   sense of how big, heavy, or large the unfamiliar thing is.
5. Both `from` and `to` must be physical objects that could plausibly appear in
   MULTIPLE different news articles. Do NOT create a new unit for something that only
   makes sense in this article (e.g. "salmon farm production in 2018",
   "Venezuela's oil reserves before reclassification", "lead level at a primary school").
   A valid new unit is a physical object with a stable, recognisable size:
   e.g. a double-decker bus, the Eiffel Tower, Wales, a football pitch.

Additional rules:
- If a unit matches something in the known list by its `id`, `label`, or any entry in its `aliases`, return its exact string `id` — do NOT create a new unit object.
- If a unit is genuinely new, return a full object:
  {{"id": "suggested_snake_case_id", "label": "Human Label", "emoji": "🔵",
    "aliases": ["plural", "alt name"], "tags": ["category"]}}
- `factor` must be a positive float (e.g. if 1 from = 200 to, factor = 200.0).
- `source_quote` must be a verbatim sentence copied from the article text above.
- Return [] when in doubt. MOST articles (around 80%) contain no valid comparison.
  That is the correct and expected output. Do not try to find something just because
  the article mentions numbers.
- Do not invent comparisons not stated in the article.
"""


MAX_EDGES_PER_ARTICLE = 3

COMPARISON_KEYWORDS = [
    "times the size", "times the area", "times the weight", "times the height",
    "times the length", "times the volume", "times larger than", "times bigger than", "times smaller than",
    "the size of", "the area of", "the weight of", "the height of",
    "as big as", "as heavy as", "as tall as", "as wide as", "as long as",
    "weighs as much as",
    "equivalent to",
]


def has_comparison_phrase(quote: str) -> bool:
    q = quote.lower()
    return any(kw in q for kw in COMPARISON_KEYWORDS)


def entry_is_recent(entry: dict, max_age_hours: int) -> bool:
    """Return True if the RSS entry is younger than max_age_hours (UTC).

    Falls through to True when max_age_hours == 0 or pubDate is absent,
    so we never silently drop an article we can't date.
    """
    if max_age_hours == 0:
        return True
    pub = entry.get("published_parsed") or entry.get("updated_parsed")
    if pub is None:
        return True  # no date info — process anyway
    age_seconds = time.time() - calendar.timegm(pub)
    return age_seconds <= max_age_hours * 3600


_last_groq_call: float = 0.0
_last_gemini_call: float = 0.0
_groq_quota_exhausted: bool = False
_gemini_quota_exhausted: bool = False


def call_groq(article_text: str, units: list[dict]) -> list[dict] | None:
    """Call Groq (Llama) and return comparisons, or None on any failure.

    Returns None (not []) on failure so call_llm() knows to try Gemini.
    Returns [] when the model genuinely found no comparisons.
    """
    global _last_groq_call, _groq_quota_exhausted
    from groq import Groq, RateLimitError

    if _groq_quota_exhausted:
        return None

    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        return None  # no key configured; fall through to Gemini silently

    min_interval = 60.0 / GROQ_RPM
    elapsed = time.monotonic() - _last_groq_call
    if elapsed < min_interval:
        wait = min_interval - elapsed
        log.debug("  llm: Groq rate-limiting, sleeping %.1fs", wait)
        time.sleep(wait)
    _last_groq_call = time.monotonic()

    truncated = article_text[:4000]
    prompt = EXTRACTION_PROMPT_TEMPLATE.format(
        units_block=build_units_prompt_block(units),
        article_text=truncated,
    )

    try:
        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0,
        )
        raw = response.choices[0].message.content.strip()
        parsed = json.loads(raw)
        # Model returns either a top-level array or wraps it in an object
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, dict):
            for key in ("comparisons", "results", "data", "items"):
                if isinstance(parsed.get(key), list):
                    return parsed[key]
        log.warning("  llm: Groq unexpected JSON shape: %r", raw[:200])
        return None
    except RateLimitError as exc:
        err = str(exc).lower()
        if "per_day" in err or "daily" in err:
            log.warning("  llm: Groq daily quota exhausted — disabling for this run")
            _groq_quota_exhausted = True
        else:
            # Temporary TPM/RPM burst limit — sleep 60s, keep Groq alive for later articles
            m = re.search(r"retry.after[^\d]*(\d+)", err, re.IGNORECASE)
            retry_secs = int(m.group(1)) if m else 60
            log.debug("  llm: Groq rate-limited (temporary), sleeping %ds", retry_secs)
            time.sleep(retry_secs)
        return None
    except json.JSONDecodeError as exc:
        log.warning("  llm: Groq JSON parse error: %s", exc)
        return None
    except Exception as exc:
        log.warning("  llm: Groq error: %s", exc)
        return None


def call_gemini(article_text: str, units: list[dict]) -> list[dict]:
    """Call Gemini Flash and return parsed comparison objects."""
    global _last_gemini_call, _gemini_quota_exhausted
    import google.generativeai as genai

    if _gemini_quota_exhausted:
        return []

    api_key = os.environ.get("GOOGLE_AI_API_KEY")
    if not api_key:
        log.warning("  llm: GOOGLE_AI_API_KEY not set")
        return []

    min_interval = 60.0 / GEMINI_RPM
    elapsed = time.monotonic() - _last_gemini_call
    if elapsed < min_interval:
        wait = min_interval - elapsed
        log.debug("  llm: Gemini rate-limiting, sleeping %.1fs", wait)
        time.sleep(wait)

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(GEMINI_MODEL)
    _last_gemini_call = time.monotonic()

    truncated = article_text[:4000]
    prompt = EXTRACTION_PROMPT_TEMPLATE.format(
        units_block=build_units_prompt_block(units),
        article_text=truncated,
    )

    try:
        response = model.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"},
        )
        raw = response.text.strip()
        parsed = json.loads(raw)
        if not isinstance(parsed, list):
            log.warning("  llm: Gemini non-list response: %r", raw[:200])
            return []
        return parsed
    except json.JSONDecodeError as exc:
        log.warning("  llm: Gemini JSON parse error: %s", exc)
        return []
    except Exception as exc:
        err = str(exc)
        m = re.search(r"retry_delay\s*\{\s*seconds:\s*(\d+)", err)
        retry_secs = int(m.group(1)) if m else None
        if "PerDay" in err:
            log.warning("  llm: Gemini daily quota exhausted")
            _gemini_quota_exhausted = True
        elif retry_secs:
            log.debug("  llm: Gemini rate-limited, sleeping %ds", retry_secs)
            time.sleep(retry_secs)
        else:
            log.warning("  llm: Gemini error: %s", exc)
        return []


def call_llm(article_text: str, units: list[dict]) -> list[dict]:
    """Try Groq first, fall back to Gemini if Groq is unavailable."""
    result = call_groq(article_text, units)
    if result is not None:
        return result  # Groq succeeded (even if empty — that's a valid answer)
    # Groq returned None: quota hit or error — try Gemini
    if not _gemini_quota_exhausted:
        log.debug("  llm: trying Gemini fallback")
        return call_gemini(article_text, units)
    return []


def _all_llms_exhausted() -> bool:
    return _groq_quota_exhausted and _gemini_quota_exhausted


# ---------------------------------------------------------------------------
# Validation helpers + per-article pipeline
# ---------------------------------------------------------------------------

def validate_comparison(comp: dict, existing_ids: set[str]) -> bool:
    """Return True if comp looks structurally valid and passes hard keyword filter."""
    if not isinstance(comp, dict):
        return False
    if "from" not in comp or "to" not in comp:
        return False
    factor = comp.get("factor")
    if not isinstance(factor, (int, float)) or factor <= 0:
        return False
    quote = comp.get("source_quote", "")
    if not quote:
        return False
    if not has_comparison_phrase(quote):
        log.debug("  Rejecting comparison — no recognised comparison phrase in quote: %r", quote[:120])
        return False
    return True


def resolve_unit(
    unit_ref,
    existing_ids: set[str],
    new_units_map: dict[str, dict],
    terms_to_id: dict[str, str],
) -> tuple[str | None, dict | None]:
    """
    Return (unit_id, new_unit_or_None).
    If unit_ref is a string → look up by id, label, or alias; create new unit if no match.
    If unit_ref is a dict → check label/aliases against existing units first, then create new.
    """
    if isinstance(unit_ref, str):
        if unit_ref in existing_ids or unit_ref in new_units_map:
            return unit_ref, None
        # Check against all ids/labels/aliases (case-insensitive)
        canonical = terms_to_id.get(unit_ref.lower())
        if canonical:
            log.debug("Unknown unit id %r — matched existing unit %r via terms lookup", unit_ref, canonical)
            return canonical, None
        # LLM returned an unknown string id — synthesise a new unit rather than
        # dropping the whole comparison (the LLM should have returned an object,
        # but sometimes it returns a plausible-looking snake_case string instead)
        log.debug("Unknown unit id %r — creating as new unit", unit_ref)
        human = unit_ref.replace("_", " ")
        unit_ref = {"id": unit_ref, "label": human.title(), "aliases": [human]}

    if isinstance(unit_ref, dict):
        # Before creating a new unit, check if label or any alias matches an existing unit
        check_terms = set()
        if unit_ref.get("label"):
            check_terms.add(unit_ref["label"].lower())
        for alias in unit_ref.get("aliases", []):
            check_terms.add(alias.lower())
        for term in check_terms:
            canonical = terms_to_id.get(term)
            if canonical:
                log.debug("New unit %r — matched existing unit %r via label/alias", unit_ref.get("id"), canonical)
                return canonical, None

        suggested_id = unit_ref.get("id") or slugify(unit_ref.get("label", "unknown"))
        # Ensure the id is valid snake_case
        suggested_id = slugify(suggested_id)
        # If already queued this run, reuse it (same article can reference a
        # new unit multiple times — don't create _2 duplicates)
        if suggested_id in new_units_map:
            return suggested_id, None
        # Deduplicate against existing unit ids only
        final_id = suggested_id
        counter = 2
        while final_id in existing_ids:
            final_id = f"{suggested_id}_{counter}"
            counter += 1

        new_unit = {
            "id": final_id,
            "label": unit_ref.get("label", final_id.replace("_", " ").title()),
        }
        if unit_ref.get("emoji"):
            new_unit["emoji"] = unit_ref["emoji"]
        if unit_ref.get("aliases"):
            new_unit["aliases"] = unit_ref["aliases"]
        if unit_ref.get("tags"):
            new_unit["tags"] = unit_ref["tags"]

        new_units_map[final_id] = new_unit
        return final_id, new_unit

    return None, None


def process_article(
    article_url: str,
    explicit_text: str,
    rss_summary: str,
    units: list[dict],
    existing_unit_ids: set[str],
    terms_to_id: dict[str, str],
    new_units_map: dict[str, dict],
    new_edges: list[dict],
    dedup_edge_keys: set[tuple],
    max_edge_num_ref: list[int],
    today: str,
    filter_both_new: bool = False,
) -> None:
    """Fetch, extract, validate and collect edges for a single article URL."""
    log.debug("--- %s", article_url)

    if explicit_text:
        # --text flag: user supplied text directly, skip all HTTP fetching
        text = BeautifulSoup(explicit_text, "html.parser").get_text(separator=" ", strip=True)
        log.debug("  fetch: using explicit text (%d chars)", len(text))
    else:
        # Always try to fetch the full article first
        text = fetch_article_text(article_url)
        if not text and rss_summary:
            # Last resort: RSS summary (usually just a headline, ~100-200 chars)
            text = BeautifulSoup(rss_summary, "html.parser").get_text(separator=" ", strip=True)
            log.debug("  fetch: HTTP failed, falling back to RSS summary (%d chars)", len(text))

    if not text:
        log.debug("  fetch: no text — skipping")
        return

    log.debug("  llm: calling...")
    all_units = units + list(new_units_map.values())
    comparisons = call_llm(text, all_units)

    if not comparisons:
        log.debug("  llm: no comparisons found")
        return

    log.debug("  llm: %d comparison(s) found", len(comparisons))

    edges_this_article = 0
    for comp in comparisons:
        if edges_this_article >= MAX_EDGES_PER_ARTICLE:
            log.debug("  Per-article cap reached (%d), stopping", MAX_EDGES_PER_ARTICLE)
            break

        if not validate_comparison(comp, existing_unit_ids):
            log.debug("  Invalid comparison: %r", comp)
            continue

        from_id, _ = resolve_unit(comp["from"], existing_unit_ids, new_units_map, terms_to_id)
        to_id, _ = resolve_unit(comp["to"], existing_unit_ids, new_units_map, terms_to_id)

        if from_id is None or to_id is None:
            continue

        if from_id == to_id:
            log.debug("  Skipping self-referential edge: %s → %s", from_id, to_id)
            continue

        if filter_both_new:
            from_is_new = from_id in new_units_map
            to_is_new = to_id in new_units_map
            if from_is_new and to_is_new:
                log.debug("  Skipping edge where both sides are new units: %s → %s", from_id, to_id)
                continue

        factor = float(comp["factor"])
        edge_key = (from_id, to_id, factor, article_url)
        if edge_key in dedup_edge_keys:
            log.debug("  Duplicate edge: %s", edge_key)
            continue
        dedup_edge_keys.add(edge_key)

        max_edge_num_ref[0] += 1
        edge_id = f"e{max_edge_num_ref[0]:03d}"

        new_edges.append({
            "id": edge_id,
            "from": from_id,
            "to": to_id,
            "factor": factor,
            "source_url": article_url,
            "source_quote": comp["source_quote"],
            "date_scraped": today,
            "verified": False,
        })
        edges_this_article += 1


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Anything But Metric scraper")
    parser.add_argument("--url", default=None,
                        help="Process a single article URL directly (skip RSS feeds)")
    parser.add_argument("--text", default=None,
                        help="Article text to use instead of fetching the URL. "
                             "Use '-' to read from stdin. Requires --url.")
    parser.add_argument("--max-feeds", type=int, default=None,
                        help="Limit number of feeds processed (useful for testing)")
    parser.add_argument("--max-entries", type=int, default=None,
                        help="Limit entries processed per feed (useful for testing)")
    parser.add_argument("--filter-both-new", action="store_true", default=False,
                        help="Reject edges where both from and to are new units created this run. "
                             "Useful once the unit catalogue is large; off by default.")
    parser.add_argument("--max-age-hours", type=int, default=DEFAULT_MAX_AGE_HOURS,
                        help="Skip RSS entries older than this many hours (0 = no filter, "
                             "useful when adding a new feed to backfill history). "
                             f"Default: {DEFAULT_MAX_AGE_HOURS}")
    parser.add_argument("-v", "--verbose", action="store_true", default=False,
                        help="Show detailed per-article fetch/LLM logs (debug output)")
    parser.add_argument(
        "--dump-text-to",
        default=None,
        metavar="FILEPATH",
        help="In --url mode: write the fetched article text to this file before "
             "processing. Used by the submission workflow to capture article text "
             "for scraper-miss issue creation.",
    )
    args = parser.parse_args()

    # --url mode is interactive; always show full detail there
    if args.verbose or args.url:
        logging.getLogger().setLevel(logging.DEBUG)

    # 1. Load existing data
    units: list[dict] = load_json(UNITS_FILE)
    edges: list[dict] = load_json(EDGES_FILE)
    log.info("Loaded %d units, %d edges", len(units), len(edges))

    existing_unit_ids: set[str] = {u["id"] for u in units}
    existing_source_urls: set[str] = {e["source_url"] for e in edges}

    # Build a lookup: every lowercased id/label/alias → canonical unit id
    # Used to match LLM output that uses a label or alias instead of the exact id
    terms_to_id: dict[str, str] = {}
    for u in units:
        terms_to_id[u["id"].lower()] = u["id"]
        terms_to_id[u["label"].lower()] = u["id"]
        for alias in u.get("aliases", []):
            terms_to_id[alias.lower()] = u["id"]

    # Find max numeric edge ID (IDs look like "e004")
    max_edge_num_ref = [0]
    for e in edges:
        m = re.match(r"e(\d+)$", e.get("id", ""))
        if m:
            max_edge_num_ref[0] = max(max_edge_num_ref[0], int(m.group(1)))

    # Accumulators
    new_units_map: dict[str, dict] = {}
    new_edges: list[dict] = []
    dedup_edge_keys: set[tuple] = {
        (e["from"], e["to"], e["factor"], e["source_url"]) for e in edges
    }

    today = date.today().isoformat()

    common = dict(
        units=units,
        existing_unit_ids=existing_unit_ids,
        terms_to_id=terms_to_id,
        new_units_map=new_units_map,
        new_edges=new_edges,
        dedup_edge_keys=dedup_edge_keys,
        max_edge_num_ref=max_edge_num_ref,
        today=today,
        filter_both_new=args.filter_both_new,
    )

    if args.url:
        # 2a. Single-URL mode — bypass RSS and the "already seen" dedup
        log.info("Single-URL mode: %s", args.url)
        if args.text:
            supplied_text = sys.stdin.read() if args.text == "-" else args.text
        else:
            supplied_text = None

        # Fetch text up-front when caller wants a dump (avoids fetching twice)
        if args.dump_text_to and not supplied_text:
            fetched = fetch_article_text(args.url)
            if fetched:
                Path(args.dump_text_to).write_text(fetched, encoding="utf-8")
                log.info("Wrote article text (%d chars) to %s", len(fetched), args.dump_text_to)
            else:
                log.warning("Could not fetch article text; dump file not written")
            supplied_text = fetched or ""

        edges_before = len(new_edges)
        units_before = len(new_units_map)
        process_article(args.url, explicit_text=supplied_text or "", rss_summary="", **common)
        log.info("Result: +%d edges, +%d units",
                 len(new_edges) - edges_before, len(new_units_map) - units_before)
    else:
        # 2b. RSS feed mode
        feed_urls = [
            line.strip()
            for line in FEEDS_FILE.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.startswith("#")
        ]
        if args.max_feeds:
            feed_urls = feed_urls[:args.max_feeds]
        log.info("Processing %d feeds", len(feed_urls))

        for feed_idx, feed_url in enumerate(feed_urls, 1):
            if _all_llms_exhausted():
                break

            log.info("Feed %d/%d: %s", feed_idx, len(feed_urls), feed_url)
            try:
                feed = feedparser.parse(feed_url)
            except Exception as exc:
                log.warning("  feedparser error: %s", exc)
                continue

            entries = feed.get("entries", [])

            if not entries:
                # feedparser got no entries — three sub-cases:
                #  (a) HTTP error fetching the feed → skip entirely
                #  (b) feedparser recognised a valid feed format but it's empty → skip
                #  (c) feedparser got a 200 but no feed format → assume a direct article URL
                #      in feeds.txt (the original intent of this fallback)
                feed_status = feed.get("status", 0)
                if feed_status >= 400:
                    log.warning("  HTTP %d — skipping", feed_status)
                    continue
                if feed.get("version"):
                    log.info("  empty feed")
                    continue
                # No recognised feed format: treat as a direct article URL
                log.debug("  no feed format detected — trying as direct article URL")
                if feed_url not in existing_source_urls:
                    existing_source_urls.add(feed_url)
                    edges_before = len(new_edges)
                    units_before = len(new_units_map)
                    process_article(feed_url, explicit_text="", rss_summary="", **common)
                    log.info("  direct article → +%d edges, +%d units",
                             len(new_edges) - edges_before, len(new_units_map) - units_before)
                else:
                    log.info("  already seen")
                continue

            if args.max_entries:
                entries = entries[:args.max_entries]

            edges_before = len(new_edges)
            units_before = len(new_units_map)
            skipped_old = 0
            skipped_dedup = 0
            processed = 0

            for entry in entries:
                if _all_llms_exhausted():
                    break

                article_url = entry.get("link", "")
                if not article_url:
                    continue
                if article_url in existing_source_urls:
                    skipped_dedup += 1
                    continue

                # skip entries older than the age threshold
                if not entry_is_recent(entry, args.max_age_hours):
                    log.debug("  skipping old entry: %s", article_url)
                    skipped_old += 1
                    continue

                existing_source_urls.add(article_url)
                processed += 1
                rss_summary = entry.get("summary") or entry.get("description") or ""
                process_article(article_url, explicit_text="", rss_summary=rss_summary, **common)

            edges_added = len(new_edges) - edges_before
            units_added = len(new_units_map) - units_before
            skip_parts = []
            if skipped_old:
                skip_parts.append(f"{skipped_old} old")
            if skipped_dedup:
                skip_parts.append(f"{skipped_dedup} seen")
            skip_str = (", " + ", ".join(skip_parts)) if skip_parts else ""
            log.info("  %d entries | %d processed%s | +%d edges, +%d units",
                     len(entries), processed, skip_str, edges_added, units_added)

    # 4. Write results
    n_new_units = len(new_units_map)
    n_new_edges = len(new_edges)

    if _groq_quota_exhausted:
        log.warning("Groq daily quota exhausted%s",
                    " — fell back to Gemini" if not _gemini_quota_exhausted else "")
    if _gemini_quota_exhausted:
        log.warning("Gemini daily quota exhausted")
    log.info("Done: +%d edges, +%d units", n_new_edges, n_new_units)

    if n_new_units > 0 or n_new_edges > 0:
        if n_new_units > 0:
            units.extend(new_units_map.values())
            save_json(UNITS_FILE, units)
        if n_new_edges > 0:
            edges.extend(new_edges)
            save_json(EDGES_FILE, edges)

    print(f"NEW_EDGES={n_new_edges}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        log.exception("Unhandled error: %s", exc)
        print("NEW_EDGES=0")
        sys.exit(0)
