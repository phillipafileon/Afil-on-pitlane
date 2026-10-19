#!/usr/bin/env python3
"""
Build a small, attributed Wikipedia INTRO-only pack for Sparky's offline FTS library.

Python standard library only. Intended to run on a development computer while online;
the resulting JSON can be imported to the Android app and then used entirely offline.

Example:
  python tools/build_sparky_wikipedia_pack.py \
    --titles tools/sparky_wikipedia_topics.txt \
    --output sparky-wikipedia-intros.json \
    --user-agent 'SparkyKnowledge/0.1 (contact: maintainer@example.org)'

Use a real contact address or web page in the UA. Do not use the example verbatim.
This script intentionally does not attempt to crawl the whole of Wikipedia.
For multi-gigabyte collections prefer the established Kiwix/OpenZIM "mini" archives,
and add a purpose-built ZIM adapter rather than loading the whole archive into RAM.
"""
import argparse
import json
import pathlib
import time
import urllib.parse
import urllib.request
import urllib.error

API = "https://en.wikipedia.org/w/api.php"
LICENCE = "Wikipedia contributors, CC BY-SA 4.0; introduction excerpt modified by truncation"
BATCH = 10


def fetch_batch(titles, user_agent):
    params = urllib.parse.urlencode({
        "action": "query",
        "prop": "extracts|info",
        "inprop": "url",
        "exintro": "1",
        "explaintext": "1",
        "redirects": "1",
        "format": "json",
        "formatversion": "2",
        "maxlag": "5",
        "titles": "|".join(titles),
    })
    request = urllib.request.Request(
        API + "?" + params,
        headers={"User-Agent": user_agent, "Accept": "application/json"},
    )
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                payload = json.load(response)
                if "error" in payload:
                    raise RuntimeError(payload["error"])
                return payload.get("query", {}).get("pages", [])
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 502, 503) or attempt == 3:
                raise
            time.sleep(3 * (attempt + 1))
    return []


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--titles", required=True, type=pathlib.Path)
    parser.add_argument("--output", required=True, type=pathlib.Path)
    parser.add_argument("--user-agent", required=True)
    parser.add_argument("--max-articles", type=int, default=500)
    args = parser.parse_args()

    if len(args.user_agent) < 20 or "example." in args.user_agent:
        parser.error("Provide a descriptive User-Agent containing your actual maintainer contact.")
    titles = []
    for line in args.titles.read_text(encoding="utf-8").splitlines():
        title = line.strip()
        if title and not title.startswith("#") and title not in titles:
            titles.append(title)
    if not 1 <= args.max_articles <= 3000:
        parser.error("--max-articles must be between 1 and 3000")
    titles = titles[: args.max_articles]

    entries = []
    for start in range(0, len(titles), BATCH):
        pages = fetch_batch(titles[start : start + BATCH], args.user_agent)
        for page in pages:
            if page.get("missing", False):
                continue
            title = str(page.get("title", "")).strip()
            excerpt = str(page.get("extract", "")).strip()
            if not title or not excerpt:
                continue
            excerpt = excerpt.replace("\r", "").split("\n\n")[0].strip()
            excerpt = excerpt[:1300].rsplit(" ", 1)[0].rstrip(" ,.;") + (
                "…" if len(excerpt) > 1300 else ""
            )
            source = page.get("fullurl")
            if not source or not source.startswith("https://en.wikipedia.org/"):
                continue
            entries.append({
                "title": title,
                "category": "Wikipedia intro · general reference",
                "summary": excerpt,
                "tags": title,
                "source": source,
                "license": LICENCE,
                "source_type": "wikimedia-reused",
            })
        print(f"Fetched {min(start + BATCH, len(titles))}/{len(titles)} titles")
        time.sleep(0.6)  # polite, bounded requests
    result = {
        "version": 1,
        "pack": "Sparky Wikipedia introductions",
        "attribution": {
            "author": "Wikipedia contributors",
            "source": "https://en.wikipedia.org/",
            "license": "Creative Commons Attribution-ShareAlike 4.0",
            "license_url": "https://creativecommons.org/licenses/by-sa/4.0/",
            "changes": "Introductions extracted, converted to plain text and sometimes shortened",
        },
        "entries": entries,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n",
                           encoding="utf-8")
    print(f"Wrote {len(entries)} attributed articles to {args.output}")


if __name__ == "__main__":
    main()
