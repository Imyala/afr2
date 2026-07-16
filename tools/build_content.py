#!/usr/bin/env python3
"""build_content.py — merge a reviewed wordlist into a course.

Turns a simple, native-reviewer-friendly wordlist file into fully-formed course
units (with generated exercises, stable ids, and integrity checks) and appends
them to data/courses/<code>.json. This is the content pipeline: a native
speaker only edits a wordlist; this tool does the rest.

Wordlist format (JSON) — see content/wordlists/*.json:
{
  "code": "af",
  "units": [
    { "title": "Unit 8: In the Kitchen", "level": "Travel",
      "lessons": [
        { "title": "Dairy & Eggs", "note": "optional cultural note",
          "vocab": [
            ["kaas", "cheese", "kaas"],
            ["eier", "egg", "AY-er", "optional per-word note"]
          ] } ] } ]
}

Usage:  python3 tools/build_content.py content/wordlists/af-kitchen.json
        python3 tools/build_content.py --all      # merge every wordlist
Re-running is safe: units/vocab whose ids already exist in the course are
skipped (idempotent), so you can extend a wordlist and re-run.
"""
import json, os, re, sys, glob, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COURSES = os.path.join(ROOT, "data", "courses")


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[.,!?'\"-]", "", re.sub(r"\s+", " ", s)).strip()


def slug(code, term):
    base = unicodedata.normalize("NFD", term.lower())
    base = "".join(c for c in base if unicodedata.category(c) != "Mn")
    base = re.sub(r"[^a-z0-9]+", "", base)
    return f"{code}-{base or 'x'}"


def gen_exercises(voc):
    """Same generator shape the app + integrity tests expect: match, 2 MC, translate."""
    terms = [v["term"] for v in voc]
    trans = [v["translation"] for v in voc]
    ex = [{"type": "match", "pairs": [[voc[i]["term"], voc[i]["translation"]] for i in range(min(4, len(voc)))]}]
    ex.append({"type": "multiple_choice", "prompt": f'“{voc[0]["term"]}” means:',
               "answer": voc[0]["translation"], "options": list(dict.fromkeys(trans[:4])), "vocabId": voc[0]["id"]})
    opts2 = list(dict.fromkeys([terms[1], terms[0]] + terms[2:4]))[:4]
    ex.append({"type": "multiple_choice", "prompt": f'How do you say “{voc[1]["translation"]}”?',
               "answer": voc[1]["term"], "options": opts2, "vocabId": voc[1]["id"]})
    ex.append({"type": "translate", "prompt": voc[2]["translation"], "answer": voc[2]["term"],
               "accept": [voc[2]["term"].lower()], "vocabId": voc[2]["id"]})
    return ex


def merge(wordlist_path):
    wl = json.load(open(wordlist_path, encoding="utf-8"))
    code = wl["code"]
    course_path = os.path.join(COURSES, f"{code}.json")
    course = json.load(open(course_path, encoding="utf-8"))

    existing_vocab = {v["id"] for u in course["units"] for l in u["lessons"] for v in l.get("vocab", [])}
    existing_units = {u["id"] for u in course["units"]}
    unit_nums = [int(m.group(1)) for u in course["units"] for m in [re.search(r"-u(\d+)$", u["id"])] if m]
    next_unit = max(unit_nums, default=0) + 1

    added_units = 0
    added_words = 0
    for uw in wl["units"]:
        uid = f"{code}-u{next_unit}"
        if any(u["title"] == uw["title"] for u in course["units"]):
            continue  # already merged this unit title
        unit = {"id": uid, "title": uw["title"], "level": uw.get("level", "Beginner"), "lessons": []}
        for li, lw in enumerate(uw["lessons"], 1):
            lid = f"{uid}-l{li}"
            voc = []
            for row in lw["vocab"]:
                term, translation, phon = row[0], row[1], row[2]
                note = row[3] if len(row) > 3 else None
                vid = slug(code, term)
                n = 2
                while vid in existing_vocab or any(vid == x["id"] for x in voc):
                    vid = f"{slug(code, term)}-{n}"; n += 1
                existing_vocab.add(vid)
                d = {"id": vid, "term": term, "translation": translation, "phonetic": phon}
                if note:
                    d["note"] = note
                voc.append(d)
                added_words += 1
            if len(voc) < 4:
                sys.exit(f"ERROR: lesson '{lw['title']}' needs >=4 words (has {len(voc)})")
            lesson = {"id": lid, "title": lw["title"], "culturalNote": lw.get("note", ""), "vocab": voc, "exercises": gen_exercises(voc)}
            unit["lessons"].append(lesson)
        course["units"].append(unit)
        existing_units.add(uid)
        next_unit += 1
        added_units += 1

    # validate: unique vocab ids + MC answer reachable
    ids = [v["id"] for u in course["units"] for l in u["lessons"] for v in l.get("vocab", [])]
    dups = {x for x in ids if ids.count(x) > 1}
    if dups:
        sys.exit(f"ERROR: duplicate vocab ids after merge: {dups}")
    for u in course["units"]:
        for l in u["lessons"]:
            for ex in l["exercises"]:
                if ex["type"] in ("multiple_choice",) and norm(ex["answer"]) not in [norm(o) for o in ex["options"]]:
                    sys.exit(f"ERROR: MC answer not in options in {l['id']}")

    json.dump(course, open(course_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    total = sum(len(l.get("vocab", [])) for u in course["units"] for l in u["lessons"])
    print(f"{code}: +{added_units} units / +{added_words} words  (course now {total} words)")


def main():
    args = sys.argv[1:]
    if args == ["--all"]:
        files = sorted(glob.glob(os.path.join(ROOT, "content", "wordlists", "*.json")))
    else:
        files = args
    if not files:
        sys.exit("usage: build_content.py <wordlist.json> [...]  |  --all")
    for f in files:
        merge(f)


if __name__ == "__main__":
    main()
