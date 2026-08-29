# Accounts & cross-device sync — setup

The app works fully offline with device-local progress and needs **no server**.
This optional backend adds real accounts and progress sync across devices. It
uses a free [Supabase](https://supabase.com) project over plain REST — the app
stays dependency-free (no SDK), and with no config file present everything
behaves exactly as before.

## One-time setup (~10 minutes)

1. **Create a Supabase project** at [database.new](https://database.new)
   (free tier is plenty). Pick a region close to your learners
   (e.g. `eu-west` for South Africa until an African region exists).

2. **Create the saves table.** In the dashboard open *SQL Editor*, paste the
   contents of [`backend/schema.sql`](../backend/schema.sql), and run it.
   This creates one `saves` row per user, locked down with row-level security
   so each signed-in user can only ever touch their own row.

3. **Decide on email confirmation.** In *Authentication → Providers → Email*:
   - leave **Confirm email** ON for production (users click a link before the
     first login), or
   - turn it OFF for classroom/testing use so signup logs straight in.
   The app handles both (it shows "check your email" when confirmation is on).

4. **Configure the app.** Copy the project's URL and `anon` `public` key from
   *Settings → API* into a new file `data/cloud.json`:

   ```json
   { "url": "https://YOUR-PROJECT-REF.supabase.co", "anonKey": "YOUR-ANON-KEY" }
   ```

   Commit and deploy it. The anon key is designed to be public — row-level
   security is what protects the data. (A template lives at
   `data/cloud.example.json`.)

That's it. On the next deploy the welcome screen's **Create account / Log in**
become real cloud accounts.

## What the app does with it

- **Sign up / log in** call Supabase auth directly (`/auth/v1/*`); the session
  (with refresh token) is kept in `localStorage` and refreshed automatically.
- **Sync down** happens at login and on every app start with a session: the
  cloud save is pulled and **merged** into local state — unions for completed
  lessons/stories/achievements, per-word "most progressed wins" for the spaced
  repetition records, max for XP/gems/records, latest-day wins for streaks.
  Two devices that both practised never wipe each other out.
- **Sync up** is a debounced push (a few seconds after any local save) plus a
  keepalive flush when the tab is hidden or closed.
- **Guests are untouched**: local-only play works exactly as before, and a
  guest who later creates an account keeps their progress (the local state is
  merged up on first login).
- **Offline stays first-class**: with no network the app just plays locally
  and pushes next time it can.

## Verifying

`tests/sync.mjs` runs the whole client (signup → login → push → pull → merge)
against an in-process fake of the two Supabase endpoints, plus unit tests for
the merge rules — it runs in CI on every push, no real project needed.
