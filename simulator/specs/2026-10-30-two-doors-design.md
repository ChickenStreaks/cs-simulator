# Two doors: «Use the app» and «See the screens» — design

Status: draft for the owner's approval · 2026-10-30 · reviewed by a builder; open points answered below

## Intent

The simulator has two jobs that today fight over one page:

1. **Use the app end to end**, like a family would: the splash plays, the slides, then the app — and what you did
   (chores marked, eggs, the clock) is still there when you come back.
2. **See any screen at a glance**, e.g. the splash again or onboarding slide 3, without clicking through the app.

The owner's idea: a page before the simulator with two doors, one for each job.

## Goals

- `/simulator/` is a small first page with two doors: **Use the app** and **See the screens**.
- **Use the app** is today's simulator (the bar: See as, Theme, Reset; the iPhone 15 / Android switch). Its data
  persists between visits until Reset, as today (the browser's storage).
  - The first visit starts at the splash. After that the door offers **Continue** (where you left off) and
    **Start from the splash**. *Start from the splash* signs out and opens the splash; it does not erase the
    family's data.
  - **Reset** (in the bar) works like a new install (owner): it erases the family's data, signs out, forgets the last
    screen and opens the splash. The first page then shows only **Start** (no «Continue») until the app is used again.
  - The path no longer breaks after onboarding: the last «Continuar» and «¿Ya tienes cuenta? Inicia sesión» both sign
    in as Mamá, set «See as» to Parent and open the parent's home (`app.today`). A stand-in until sign-up and sign-in
    are designed (owner: «enter as parent, I will work on the design later»); the flow doc marks them «not built yet».
- **See the screens** is a gallery: every catalog screen and every state of it as a small live phone, grouped by
  flow (First open, The daily loop, Prizes), each with the screen's and the state's name. A click opens that screen
  at that state in the **Use the app** phone.

## Non-goals

- No sign-up or sign-in screen (the owner designs them later).
- No storyboard / arrows / step order in the gallery — it is a catalog of screens, not a walk-through (the
  storyboard was tried and rolled back today).
- No change to the app's screens themselves, nor to the console API (`WB`, `WBShell`).
- Final visual polish of the first page and the gallery: «we will polish» (owner). A clean first version in the
  shell's current look (night bar, Fogata refinada palette) is enough.

## Anti-goals

- The gallery must never change the family's data or who you «See as»: looking is not using.
- A gallery thumbnail must never move on by itself (the splash thumbnail plays, but never goes to onboarding).

## Constraints

- Everything lives inside `simulator/` (AGENTS rule 3); the flows move with the change (rule 1: `flows/first-open.md`,
  `flows/shell-header.md`); `pnpm check` and the Playwright specs pass (Chromium and WebKit iPhone 15).
- Generated files come only from `tools/build-screens.mjs`.
- The blueprint wins: the sign-in stand-in and the splash timing are simulator-only; they go to `DECISIONS.md`
  as provisional (the splash already is F6).
- Copy on the simulator's own pages is English (as the bar); the app's screens stay Mexican Spanish.

## Approaches considered (thumbnails)

1. **Live mini screens** — each thumbnail is the real screen in a scaled-down frame, in a «still» mode (it shows as
   the state's person, never navigates, never writes, never runs the clock's automations). Always current; ~28
   frames, loaded lazily. **Chosen by the owner.**
2. Screenshots made by a tool — instant page, but stale after every screen change, the splash frozen, needs the
   test browser.
3. Live only on hover — lightest, but loses «everything at once», which is why the gallery was chosen.

## Decided

- Pages: `/simulator/` the doors · `/simulator/app.html` the simulator (today's `index.html` moves here) ·
  `/simulator/gallery.html` the screens. (Pretty URLs `/simulator/app` and `/simulator/gallery` work on the
  «like production» server.)
- **The gallery's data** (my call): every thumbnail reads a fresh copy of the standard family (`shell-base`, the clock
  at now) held in memory — never the visitor's saved data, and never written. So the gallery looks the same for
  everyone and looking never changes «Use the app».
- **Whose eyes** (my call): parent screens are seen as Mamá; a kid's screens (`app.kid`, `app.prizes`) as the kid in
  the state's params; a state can name its viewer with an optional `"as"` in the catalog, used where the kid has no
  phone or the state is the adult's view (e.g. `app.kid · default` for Emi, `app.kid · missed` «(adulto)») → Mamá.
  The existing `no-access` previews keep their own viewer.
- **Old links** (my call): `/simulator/#<screen>?…` forwards to `/simulator/app.html#<screen>?…`; `/simulator/` with
  no hash shows the doors.
- Gallery groups come from each catalog screen's `flow` (its flow doc's title); screens with no flow go to «Other».
  `dev.*` screens are left out. Within a group, catalog order; each screen's states in catalog order.
- A thumbnail shows its state as the catalog drives it (`?estado=` for `drive` states, the state's own `params`).
  A state that is not `drive` shows what the data gives.
- Clicking a thumbnail opens `/simulator/app.html#<screen>?<params>` at that state, in the visitor's own data and
  «See as» (it does not switch person), so it may look different from the thumbnail; that is expected.
- The door «Continue» exists only when the app was opened before (the shell's saved last screen).

## Left to the builder

- How the «still» mode is passed to a frame (a URL parameter is fine) and how the gallery scales frames.
- The first page's and the gallery's layout details, within the shell's palette.
- Test coverage: the doors, the gallery (groups, a still that does not move, a click that opens the app), the
  onboarding → Mamá's home path, and moving the existing specs to `app.html`.
