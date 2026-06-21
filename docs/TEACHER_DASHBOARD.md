# Teacher dashboard — design proposal

The goal: let a teacher run MzansiLingo as part of a class and **see real,
measurable progress** for every learner — the same "proof of learning" promise,
but at class scale. This is a design proposal for discussion before building.

## Who it's for

- A teacher running a class set of devices (or learners on their own phones).
- Mostly **offline-first**, like the rest of the app. Sync is opportunistic.

## Core screens

1. **Class overview**
   - Tiles for: learners active today, average streak, total words mastered
     across the class, average retention %.
   - A simple table: each learner's row → streak, words mastered, lessons done,
     retention %, last active.
   - Colour flags: 🟢 on track, 🟡 slipping (no activity 3+ days), 🔴 stuck
     (retention falling).

2. **Learner detail**
   - The learner's own Progress dashboard (words mastered, retention,
     baseline → re-test), plus which words they're struggling with most
     (low-ease SRS items) so the teacher can re-teach them.

3. **Baseline & re-test report** (the headline artefact)
   - Class-wide baseline vs 1-month re-test, per learner and as an average.
   - **Printable / exportable** (PDF or CSV) for parents and school records.

4. **Assignments**
   - Teacher sets a goal: "Finish Unit 1 by Friday" or "10-min daily streak".
   - Appears as a quest/banner in each learner's app.

## How the data moves (offline-friendly)

Three options, increasing in effort:

- **A. Class code + manual share (MVP, no backend).** Each device exports a
  small JSON progress summary (or QR code); the teacher's device imports them
  to build the class view. Fully offline, zero infrastructure. Good first cut.
- **B. Local network sync.** Devices on the same school Wi-Fi sync to the
  teacher's device. Offline from the internet, still no cloud.
- **C. Optional cloud sync.** A lightweight backend so the teacher sees live
  data anywhere. Needed for at-home learners; this is where a **subscription**
  (school/teacher plan) naturally fits.

Recommendation: build **A** first — it proves the value with no backend and
stays true to the offline ethos — then layer **C** for schools that want it as
a paid plan.

## Privacy (this matters — it's children's data)

- No personal data beyond a display name/initials is required.
- Progress summaries contain learning metrics only, never free-text.
- Cloud sync (option C) would need school/guardian consent and POPIA
  (South Africa's data-protection act) compliance.

## Where it ties into monetisation

- The **teacher/school plan** (option C cloud sync + class management +
  printable reports) is a natural subscription tier, separate from the
  consumer Premium. Locking *cloud* class management behind a school plan —
  while keeping the on-device learning and offline books free/cheap for
  learners — keeps the classroom mission intact.

## Suggested build order

1. Per-device **progress export/import** (JSON) + a read-only class view (A).
2. **Printable baseline → re-test report**.
3. Assignments as quests.
4. Optional cloud sync + school subscription (C).
