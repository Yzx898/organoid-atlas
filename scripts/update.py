#!/usr/bin/env python3
"""Incrementally collect organoid literature from Europe PMC."""

import json
import os
import re
import time
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs/data/articles.json"
INDEX = ROOT / "docs/data/index.json"
SHARDS = ROOT / "docs/data/articles"
RECENT = ROOT / "docs/data/recent.json"
OVERRIDES = ROOT / "reviews.json"
CONFIG = json.loads((ROOT / "docs/config.json").read_text(encoding="utf-8"))
API = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
TERMS = "(" + " OR ".join('("MPS" AND (microphysiological OR organoid OR "organ chip" OR "tissue chip"))' if term.upper() == 'MPS' else '"' + term.replace('"', '') + '"' for term in CONFIG["coreTerms"]) + ")"
CHIP = re.compile(r"organ(?:oid|s)?[- ]on[- ](?:a[- ])?chips?|organ(?:oid|s)?[- ]chips?|tissue[- ]on[- ](?:a[- ])?chips?|microphysiological|organ chips?", re.I)
ORGANOID = re.compile(r"organoids?|assembloids?|tumoroids?|enteroids?", re.I)
REVIEW = re.compile(r"review|meta-analysis|systematic review", re.I)
EXCLUDE = re.compile(r"editorial|letter|comment|correction|retraction|erratum|conference|book chapter|interview|news|biography", re.I)


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


def load_saved():
    if INDEX.exists():
        manifest = json.loads(INDEX.read_text(encoding="utf-8"))
        articles = []
        for year in manifest["years"]:
            articles.extend(json.loads((SHARDS / f"{year}.json").read_text(encoding="utf-8")))
        return {**manifest, "articles": articles}
    return json.loads(DATA.read_text(encoding="utf-8")) if DATA.exists() else {"articles": []}


def write_shards(output):
    SHARDS.mkdir(parents=True, exist_ok=True)
    groups = {}
    for article in output["articles"]:
        groups.setdefault((article.get("date") or "unknown")[:4], []).append(article)
    for year, articles in groups.items():
        (SHARDS / f"{year}.json").write_text(json.dumps(articles, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    for path in SHARDS.glob("*.json"):
        if path.stem not in groups:
            path.unlink()
    sections = {section: sum(article.get("section") == section for article in output["articles"]) for section in ("research", "review", "preprint")}
    manifest = {"updatedAt": output["updatedAt"], "source": output["source"], "count": len(output["articles"]), "sections": sections, "years": sorted(groups, reverse=True)}
    INDEX.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    recent_cutoff = (date.today() - timedelta(days=400)).isoformat()
    recent = [article for article in output["articles"] if (article.get("date") or "") >= recent_cutoff]
    RECENT.write_text(json.dumps(recent, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    if DATA.exists():
        DATA.unlink()


def classify(item):
    title = item.get("title") or ""
    abstract = re.sub(r"<[^>]+>", " ", item.get("abstractText") or "")
    types = " ".join((item.get("pubTypeList") or {}).get("pubType") or [])
    if EXCLUDE.search(types) or EXCLUDE.search(title):
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
    journal_title = (journal.get("journal") or {}).get("title") or item.get("journalTitle") or ""
    metric = next((value for name, value in CONFIG.get("journalMetrics", {}).items() if name.casefold() == journal_title.casefold()), {})
    keywords = (item.get("keywordList") or {}).get("keyword") or []
    if isinstance(keywords, str):
        keywords = [keywords]
    affiliations = []
    for author in (item.get("authorList") or {}).get("author") or []:
        for detail in (author.get("authorAffiliationDetailsList") or {}).get("authorAffiliation") or []:
            value = (detail.get("affiliation") or "").strip()
            if value and value not in affiliations:
                affiliations.append(value)
    if not affiliations and item.get("affiliation"):
        affiliations.append(item["affiliation"].strip())
    full_text = (item.get("fullTextUrlList") or {}).get("fullTextUrl") or []
    open_url = next((link.get("url", "") for link in full_text if link.get("availabilityCode") == "OA" and link.get("documentStyle") == "html"), "")
    if not open_url and item.get("pmcid") and item.get("isOpenAccess") == "Y":
        open_url = "https://europepmc.org/articles/" + item["pmcid"]
    return {
        "key": key_of(item), "doi": doi, "pmid": str(item.get("pmid") or ""),
        "source": source, "sourceId": uid, "title": item["title"].strip(),
        "authors": item.get("authorString") or "", "journal": journal_title,
        "date": item.get("firstPublicationDate") or item.get("firstIndexDate") or "",
        "onlineDate": item.get("electronicPublicationDate") or "", "articleType": " ".join((item.get("pubTypeList") or {}).get("pubType") or []),
        "peerReviewStatus": "preprint" if source == "PPR" else "published", "keywords": keywords,
        "pmcid": item.get("pmcid") or "", "openAccess": item.get("isOpenAccess") == "Y",
        "openAccessUrl": open_url, "license": item.get("license") or "", "affiliations": affiliations,
        "journalMetrics": metric,
        "abstract": abstract, "url": "https://doi.org/" + urllib.parse.quote(doi, safe="/") if doi else f"https://europepmc.org/article/{source}/{uid}",
        "section": section, "tags": tags, "titleZh": "", "abstractZh": "", "takeaways": [],
        "reviewed": False, "foundAt": today,
    }


def collect_window(start, end):
    """Fetch a short date window, splitting if the API truncates its results."""
    query = f"{TERMS} AND FIRST_PDATE:[{start} TO {end}] sort_date:y"
    cursor, seen_cursors, retrieved = "*", set(), 0
    while True:
        result = request_json({"query": query, "format": "json", "resultType": "core", "pageSize": 1000, "cursorMark": cursor})
        batch = result.get("resultList", {}).get("result", [])
        count = int(result.get("hitCount") or 0)
        yield from batch
        retrieved += len(batch)
        if retrieved >= count and len(batch) < 1000:
            return
        next_cursor = result.get("nextCursorMark")
        if batch and next_cursor and next_cursor != cursor and next_cursor not in seen_cursors:
            seen_cursors.add(cursor)
            cursor = next_cursor
            continue
        left, right = date.fromisoformat(start), date.fromisoformat(end)
        if left >= right:
            raise RuntimeError(f"Cannot retrieve all {count} hits for {start}; pagination stalled")
        midpoint = left + (right - left) // 2
        print(f"Splitting {start}..{end}: {retrieved}/{count} hits retrieved", flush=True)
        # The initial page was already yielded; downstream DOI/PMID dedup handles overlap.
        yield from collect_window(start, midpoint.isoformat())
        yield from collect_window((midpoint + timedelta(days=1)).isoformat(), end)
        return


def collect(start, end):
    """Query contiguous two-week windows so API count/cursor caps cannot skip years."""
    day, last = date.fromisoformat(start), date.fromisoformat(end)
    windows = 0
    while day <= last:
        window_end = min(day + timedelta(days=13), last)
        yield from collect_window(day.isoformat(), window_end.isoformat())
        windows += 1
        if windows % 28 == 0:
            print(f"Searched through {window_end.isoformat()} ({windows} windows)", flush=True)
        day = window_end + timedelta(days=1)


def main():
    today = date.today()
    start = (today - timedelta(days=365 * 8 + 2)).isoformat()
    saved = load_saved()
    if os.getenv("REPACK_ONLY") == "1":
        floor = (today - timedelta(days=365 * 8 + 2)).isoformat()
        saved["articles"] = [a for a in saved["articles"] if (a.get("date") or "") >= floor and not EXCLUDE.search((a.get("title") or "") + " " + (a.get("articleType") or ""))]
        write_shards(saved)
        print(f"Repacked {len(saved['articles'])} articles into year files", flush=True)
        return
    if saved.get("articles"):
        # Recheck a generous overlap for indexing delays and corrected metadata.
        start = max(start, (today - timedelta(days=60)).isoformat()) if saved.get("articles") and os.getenv("BACKFILL") != "1" else start
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
    # Reapply exclusion to previously stored records too: older collection runs may
    # have admitted interviews or editorials which the current query no longer admits.
    floor = (today - timedelta(days=365 * 8 + 2)).isoformat()
    eligible = [a for a in articles.values() if (a.get("date") or "") >= floor and not EXCLUDE.search((a.get("title") or "") + " " + (a.get("articleType") or ""))]
    output = {"updatedAt": today.isoformat(), "source": "Europe PMC", "articles": sorted(eligible, key=lambda a: (a["date"], a["key"]), reverse=True)}
    write_shards(output)
    print(f"Processed {count} records; retained {len(output['articles'])} unique articles")
    dates = [item["date"] for item in output["articles"] if item["date"]]
    if dates:
        print(f"Publication dates: {min(dates)} through {max(dates)}")


if __name__ == "__main__":
    main()
