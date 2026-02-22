#!/usr/bin/env python3
"""
Anything But Metric — daily scraper.

Fetches RSS feeds, extracts journalistic unit comparisons via Gemini Flash,
and appends new edges (verified=false) to data/edges.json.

Exits with code 0 always; prints NEW_EDGES=<n> so GitHub Actions can
detect whether a PR is needed.
"""

import argparse
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
FETCH_TIMEOUT = 15          # seconds for raw HTML requests (trafilatura fallback)
JINA_TIMEOUT = 30           # seconds for Jina Reader (headless browser, needs more time)
GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_RPM = 5              # free-tier requests per minute; enforced with sleep

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
                log.debug("  trafilatura succeeded (%d chars)", len(result))
                return result
    except Exception as exc:
        log.warning("  trafilatura fetch failed for %s: %s", url, exc)

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
                log.debug("  Jina fallback succeeded (%d chars)", len(text))
                return text
            log.warning("  Jina returned too little text (%d chars): %s", len(text), url)
    except Exception as exc:
        log.warning("  Jina fetch failed for %s: %s", url, exc)

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

A journalistic unit comparison is a sentence like:
  "The lake is the size of 200 football pitches."
  "Scientists discovered a deposit 3 times the size of Wales."
  "The whale weighs as much as 30 double-decker buses."

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

Rules:
- If a unit matches something in the known list, return its exact string id.
- If a unit is genuinely new, return a full object:
  {{"id": "suggested_snake_case_id", "label": "Human Label", "emoji": "🔵",
    "aliases": ["plural", "alt name"], "tags": ["category"]}}
- `factor` must be a positive float (e.g. if 1 from = 200 to, factor = 200.0).
- `source_quote` must be a verbatim sentence copied from the article text above.
- Return [] if no journalistic comparisons are found.
- Do not invent comparisons not stated in the article.
"""


_last_gemini_call: float = 0.0   # module-level timestamp for rate limiting


def call_gemini(article_text: str, units: list[dict]) -> list[dict]:
    """Call Gemini Flash and return parsed comparison objects."""
    global _last_gemini_call
    import google.generativeai as genai

    api_key = os.environ.get("GOOGLE_AI_API_KEY")
    if not api_key:
        log.error("GOOGLE_AI_API_KEY not set — skipping Gemini call")
        return []

    # Enforce free-tier RPM limit
    min_interval = 60.0 / GEMINI_RPM
    elapsed = time.monotonic() - _last_gemini_call
    if elapsed < min_interval:
        wait = min_interval - elapsed
        log.info("  Rate limiting: sleeping %.1fs", wait)
        time.sleep(wait)

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(GEMINI_MODEL)
    _last_gemini_call = time.monotonic()

    # Truncate article to avoid token limits (~8k chars ≈ 2k tokens)
    truncated = article_text[:8000]
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
            log.warning("Gemini returned non-list: %r", raw[:200])
            return []
        return parsed
    except json.JSONDecodeError as exc:
        log.warning("Gemini JSON parse error: %s", exc)
        return []
    except Exception as exc:
        log.warning("Gemini API error: %s", exc)
        return []


# ---------------------------------------------------------------------------
# Validation helpers + per-article pipeline
# ---------------------------------------------------------------------------

def validate_comparison(comp: dict, existing_ids: set[str]) -> bool:
    """Return True if comp looks structurally valid."""
    if not isinstance(comp, dict):
        return False
    if "from" not in comp or "to" not in comp:
        return False
    factor = comp.get("factor")
    if not isinstance(factor, (int, float)) or factor <= 0:
        return False
    if not comp.get("source_quote"):
        return False
    return True


def resolve_unit(
    unit_ref,
    existing_ids: set[str],
    new_units_map: dict[str, dict],
) -> tuple[str | None, dict | None]:
    """
    Return (unit_id, new_unit_or_None).
    If unit_ref is a string → existing id (validate it).
    If unit_ref is a dict → new unit; deduplicate id if needed.
    """
    if isinstance(unit_ref, str):
        if unit_ref in existing_ids or unit_ref in new_units_map:
            return unit_ref, None
        log.warning("Unknown unit id %r — skipping comparison", unit_ref)
        return None, None

    if isinstance(unit_ref, dict):
        suggested_id = unit_ref.get("id") or slugify(unit_ref.get("label", "unknown"))
        # Ensure the id is valid snake_case
        suggested_id = slugify(suggested_id)
        # Deduplicate against existing and already-queued new units
        final_id = suggested_id
        counter = 2
        while final_id in existing_ids or (
            final_id in new_units_map and new_units_map[final_id] != unit_ref
        ):
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
    fallback_text: str,
    units: list[dict],
    existing_unit_ids: set[str],
    new_units_map: dict[str, dict],
    new_edges: list[dict],
    dedup_edge_keys: set[tuple],
    max_edge_num_ref: list[int],
    today: str,
) -> None:
    """Fetch, extract, validate and collect edges for a single article URL."""
    if fallback_text:
        # Supplied text (--text flag or RSS summary) — skip HTTP fetch
        text = BeautifulSoup(fallback_text, "html.parser").get_text(separator=" ", strip=True)
    else:
        text = fetch_article_text(article_url)
    if not text:
        log.debug("  No text for: %s", article_url)
        return

    log.info("  Calling Gemini for: %s", article_url)
    all_units = units + list(new_units_map.values())
    comparisons = call_gemini(text, all_units)

    if not comparisons:
        return

    log.info("  Got %d comparisons", len(comparisons))

    for comp in comparisons:
        if not validate_comparison(comp, existing_unit_ids):
            log.debug("  Invalid comparison: %r", comp)
            continue

        from_id, _ = resolve_unit(comp["from"], existing_unit_ids, new_units_map)
        to_id, _ = resolve_unit(comp["to"], existing_unit_ids, new_units_map)

        if from_id is None or to_id is None:
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
    args = parser.parse_args()

    # 1. Load existing data
    log.info("Loading units and edges…")
    units: list[dict] = load_json(UNITS_FILE)
    edges: list[dict] = load_json(EDGES_FILE)

    existing_unit_ids: set[str] = {u["id"] for u in units}
    existing_source_urls: set[str] = {e["source_url"] for e in edges}

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
        new_units_map=new_units_map,
        new_edges=new_edges,
        dedup_edge_keys=dedup_edge_keys,
        max_edge_num_ref=max_edge_num_ref,
        today=today,
    )

    if args.url:
        # 2a. Single-URL mode — bypass RSS and the "already seen" dedup
        log.info("Single-URL mode: %s", args.url)
        if args.text:
            supplied_text = sys.stdin.read() if args.text == "-" else args.text
            log.info("  Using supplied text (%d chars)", len(supplied_text))
        else:
            supplied_text = None
        process_article(args.url, fallback_text=supplied_text or "", **common)
    else:
        # 2b. RSS feed mode
        feed_urls = [
            line.strip()
            for line in FEEDS_FILE.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.startswith("#")
        ]
        if args.max_feeds:
            feed_urls = feed_urls[:args.max_feeds]
        log.info("Processing %d feed URLs", len(feed_urls))

        for feed_url in feed_urls:
            log.info("Fetching feed: %s", feed_url)
            try:
                feed = feedparser.parse(feed_url)
            except Exception as exc:
                log.warning("feedparser error on %s: %s", feed_url, exc)
                continue

            entries = feed.get("entries", [])
            if args.max_entries:
                entries = entries[:args.max_entries]
            log.info("  %d entries to process", len(entries))

            for entry in entries:
                article_url = entry.get("link", "")
                if not article_url:
                    continue
                if article_url in existing_source_urls:
                    log.debug("  Already seen: %s", article_url)
                    continue
                existing_source_urls.add(article_url)

                fallback = entry.get("summary") or entry.get("description") or ""
                process_article(article_url, fallback_text=fallback, **common)

    # 4. Write results
    n_new_units = len(new_units_map)
    n_new_edges = len(new_edges)

    if n_new_units > 0 or n_new_edges > 0:
        if n_new_units > 0:
            log.info("Appending %d new units", n_new_units)
            units.extend(new_units_map.values())
            save_json(UNITS_FILE, units)

        if n_new_edges > 0:
            log.info("Appending %d new edges", n_new_edges)
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
