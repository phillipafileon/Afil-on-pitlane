#!/usr/bin/env python3
"""Offline smoke tests for Sparky's knowledge pack and retrieval relevance.

Intentionally no network or Android emulator dependency.
The selection/ranking approximates SparkyKnowledge.java, and protects regressions
such as retrieving Photosynthesis for a question about GT3.
"""
import json
import pathlib
import re
import sqlite3

ROOT = pathlib.Path(__file__).resolve().parents[1]
PACK = ROOT / "spark/src/main/assets/sparky-starter-knowledge.json"
STOP = set("""what when where which about tell please could would should whose have does
with from that this they them were cars car race racing winner won history know
explain give some more there who why how the and for are was has had his her our
its your you me my we us can will into not but here in is it as of at to be an
do did on by or if up out after happened""".split())


def keywords(text):
    words = []
    for match in re.findall(r"[^\W_]{2,}", text.lower(), re.UNICODE):
        if match not in STOP and match not in words:
            words.append(match)
        if len(words) == 8:
            break
    return words


def rank(database, question):
    words = keywords(question)
    if not words:
        return []
    match = " OR ".join(f"{w}*" for w in words)
    candidates = database.execute(
        "select title, summary from knowledge where knowledge match ? limit 120",
        (match,),
    ).fetchall()
    scores = []
    for title, summary in candidates:
        title_terms = set(keywords(title))
        body_terms = set(keywords(summary))
        title_hits = sum(word in title_terms for word in words)
        if not title_hits:
            continue
        score = 12 * title_hits + sum(
            2 for word in words if word not in title_terms and word in body_terms
        )
        if title_hits == len(words):
            score += 10
        scores.append((score, title))
    return [title for _, title in sorted(scores, key=lambda s: -s[0])[:4]]


def main():
    data = json.loads(PACK.read_text(encoding="utf-8"))
    assert data["version"] == 1
    articles = data["entries"]
    assert len(articles) >= 40
    for a in articles:
        assert a["title"] and a["summary"], "Every reference needs a subject and text"
        assert not a["source"] or a["source"].startswith("https://")
    con = sqlite3.connect(":memory:")
    con.execute("create virtual table knowledge using fts4(title,summary,tokenize=unicode61)")
    con.executemany("insert into knowledge values (?,?)",
                    ((a["title"], a["summary"]) for a in articles))
    expectations = {
        "What happened at Le Mans in 1979?": "1979 24 Hours of Le Mans",
        "Who won Le Mans in 2000?": "2000 24 Hours of Le Mans",
        "What is GT3 racing?": "GT3 racing",
        "Tell me about our Porsche 924": "Porsche 924",
        "Explain a differential": "Differential",
        "What is photosynthesis?": "Photosynthesis",
    }
    for question, expected in expectations.items():
        hits = rank(con, question)
        assert hits and hits[0] == expected, f"Wrong top article for {question!r}: {hits}"
        if "GT3" in question:
            assert "Photosynthesis" not in hits, "GT3 reference pollution"
        print("PASS", question, "=>", hits[0])
    print(f"PASS all knowledge ranking checks: {len(articles)} entries")


if __name__ == "__main__":
    main()
