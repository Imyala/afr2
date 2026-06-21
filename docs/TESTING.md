# Testing

## Logic + content tests (no dependencies)

These cover the spaced-repetition engine, answer grading, and content
integrity (every exercise answer reachable, every vocab reference resolves,
every word has phonetics for the offline fallback).

```bash
node tests/run.mjs
```

Run this after editing any `data/courses/*.json` file — it will fail loudly if
an exercise's correct answer isn't among its options, if a `vocabId` is a typo,
or if a word is missing phonetics.

## Browser smoke test (optional, needs Playwright + a server)

Serve the app and drive it with a headless browser to confirm onboarding, a
full lesson, the progress dashboard, the baseline test, and **offline reload**
all work end to end.

```bash
# 1. serve
python3 -m http.server 8000 &

# 2. with Playwright available, a script can:
#    - load http://localhost:8000
#    - pick a language, complete a lesson answering correctly
#    - open Progress, run the baseline test
#    - context.setOffline(true), reload, confirm the app + a lesson still load
```

The offline check is the important one: it proves the service worker is
serving the shell, code, and lesson JSON from cache with the network disabled.

## What "green" looks like

`tests/run.mjs` prints `N passed, 0 failed` and exits 0. At the time of
writing it runs ~290 assertions across the three shipped courses.
