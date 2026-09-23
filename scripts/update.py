#!/usr/bin/env python3
"""Incrementally collect organoid literature from Europe PMC."""

import json
import re
import time
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs/data/articles.json"
OVERRIDES = ROOT / "reviews.json"
API = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
TERMS = '(organoid OR organoids OR "organ-on-a-chip" OR "organ-on-chip" OR "organoid-on-chip" OR "organoids-on-chips" OR "microphysiological system")'
CHIP = re.compile(r"organ(?:oid|s)?[- ]on[- ](?:a[- ])?chip|organ(?:oid|s)?[- ]chip|microphysiological|organ chip", re.I)
ORGANOID = re.compile(r"organoid", re.I)
REVIEW = re.compile(r"review|meta-analysis|systematic review", re.I)
EXCLUDE = re.compile(r"editorial|letter|comment|correction|retraction|erratum|conference|book chapter", re.I)


def request_json(params):
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "OrganoidAtlas/1.0 (academic literature index)", "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=35) as response:
                return json.load(response)
        except (OSError, ValueError):
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


def key_of(item):
    doi = (item.get("doi") or "").strip().lower()
    pmid = str(item.get("pmid") or "").strip()
    return "doi:" + doi if doi else "pmid:" + pmid if pmid else "epmc:" + str(item.get("source", "")) + ":" + str(item.get("id", ""))


def aliases(item):
    values = {key_of(item)}
    if item.get("doi"):
        values.add("doi:" + item["doi"].strip().lower())
    if item.get("pmid"):
        values.add("pmid:" + str(item["pmid"]).strip())
    return values


def classify(item):
    title = item.get("title") or ""
    abstract = re.sub(r"<[^>]+>", " ", item.get("abstractText") or "")
    types = " ".join((item.get("pubTypeList") or {}).get("pubType") or [])
    if EXCLUDE.search(types):
        return None
    section = "preprint" if item.get("source") == "PPR" else "review" if REVIEW.search(types) or REVIEW.search(title) else "research"
    haystack = title + " " + abstract
    tags = []
    if ORGANOID.search(haystack):
        tags.append("类器官")
    if CHIP.search(haystack):
        tags.append("器官芯片")
    if not tags:
        return None
    return section, tags


def normalize(item, today):
    category = classify(item)
    if not category or not item.get("title"):
        return None
    section, tags = category
    doi = (item.get("doi") or "").strip()
    source = item.get("source") or "MED"
    uid = str(item.get("id") or item.get("pmid") or "")
    abstract = re.sub(r"<[^>]+>", " ", item.get("abstractText") or "")
    abstract = re.sub(r"\s+", " ", abstract).strip()
    journal = item.get("journalInfo") or {}
    return {
        "key": key_of(item), "doi": doi, "pmid": str(item.get("pmid") or ""),
        "source": source, "sourceId": uid, "title": item["title"].strip(),
        "authors": item.get("authorString") or "", "journal": (journal.get("journal") or {}).get("title") or item.get("journalTitle") or "",
        "date": item.get("firstPublicationDate") or item.get("firstIndexDate") or "",
        "abstract": abstract, "url": "https://doi.org/" + urllib.parse.quote(doi, safe="/") if doi else f"https://europepmc.org/article/{source}/{uid}",
        "section": section, "tags": tags, "titleZh": "", "abstractZh": "", "takeaways": [],
        "reviewed": False, "foundAt": today,
    }


def collect(start, end):
    query = f"{TERMS} AND FIRST_PDATE:[{start} TO {end}] sort_date:y"
    cursor = "*"
    while True:
        result = request_json({"query": query, "format": "json", "resultType": "core", "pageSize": 1000, "cursorMark": cursor})
        batch = result.get("resultList", {}).get("result", [])
        yield from batch
        next_cursor = result.get("nextCursorMark")
        if not batch or not next_cursor or next_cursor == cursor:
            break
        cursor = next_cursor


def main():
    today = date.today()
    start = (today - timedelta(days=365 * 8 + 2)).isoformat()
    if DATA.exists():
        saved = json.loads(DATA.read_text(encoding="utf-8"))
        # Recheck a generous overlap for indexing delays and corrected metadata.
        start = max(start, (today - timedelta(days=60)).isoformat()) if saved.get("articles") else start
    else:
        saved = {"articles": []}
    reviews = json.loads(OVERRIDES.read_text(encoding="utf-8")) if OVERRIDES.exists() else {}
    articles = {a["key"]: a for a in saved.get("articles", [])}
    lookup = {alias: a["key"] for a in articles.values() for alias in aliases(a)}
    count = 0
    for raw in collect(start, today.isoformat()):
        item = normalize(raw, today.isoformat())
        if item is None:
            continue
        old_key = next((lookup[a] for a in aliases(item) if a in lookup), None)
        old = articles.pop(old_key, {}) if old_key else {}
        item.update({k: old[k] for k in ("titleZh", "abstractZh", "takeaways", "reviewed", "foundAt") if k in old})
        override = next((reviews[a] for a in aliases(item) if a in reviews), {})
        item.update({k: v for k, v in override.items() if k in ("titleZh", "abstractZh", "takeaways", "reviewed", "hidden", "tags", "section")})
        articles[item["key"]] = item
        lookup.update({a: item["key"] for a in aliases(item)})
        count += 1
    # Review edits also apply to older articles outside the current refresh window.
    for item in articles.values():
        override = next((reviews[a] for a in aliases(item) if a in reviews), {})
        item.update({k: v for k, v in override.items() if k in ("titleZh", "abstractZh", "takeaways", "reviewed", "hidden", "tags", "section")})
    output = {"updatedAt": today.isoformat(), "source": "Europe PMC", "articles": sorted(articles.values(), key=lambda a: (a["date"], a["key"]), reverse=True)}
    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Processed {count} records; retained {len(output['articles'])} unique articles")


if __name__ == "__main__":
    main()
