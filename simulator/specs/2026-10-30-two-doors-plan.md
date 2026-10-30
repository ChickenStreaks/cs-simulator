# Two Doors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A first page with two doors — «Use the app» (today's simulator, starting at the splash, data kept until Reset) and «See the screens» (a gallery of every screen and state as small live phones).

**Architecture:** The shell moves from `index.html` to `app.html`; `index.html` becomes the doors page; `gallery.html` is new. Gallery thumbnails are the real screens in a «still» mode of `sim.js` (an in-memory standard family, a fixed viewer, no navigation, no writes). The onboarding's end signs in as Mamá as a stand-in for sign-up.

**Tech Stack:** Plain HTML/CSS/ES5-style JS (as `shell/shell.js`, `sim.js`), Node build tools, Playwright specs (Chromium 1440 px + WebKit iPhone 15).

**Spec:** `simulator/specs/2026-10-30-two-doors-design.md`

## Global Constraints

- Write only inside `simulator/` (AGENTS rule 3). **No commits** — the owner commits when they say so (repo `CLAUDE.md`); where this skill says «Commit», stop at «verified».
- Each task updates the flow docs it touches (`flows/first-open.md`, `flows/shell-header.md`) and `DECISIONS.md` (AGENTS rule 1); `node tools/check-flows.mjs` stays «in step».
- Generated files only from `node tools/build-screens.mjs`.
- `pnpm check` (repo root) and `cd simulator/tests && npx playwright test` pass after every task.
- Simulator pages' copy is English; the app's screens stay Mexican Spanish.
- Visual style: the shell's current tokens (`--sh-night`, `--sh-cream`, `--sh-soft`, `--sh-egg`, `--cs-*`); «we will polish» — clean, not final.
- `tools/hot-serve.mjs` caches its imports: after changing `tools/build-screens.mjs` or `server/`, restart `pnpm dev`.

## Review Focus

1. **A first-ever visit to the gallery** (empty browser storage) must leave `localStorage['cs-sim/v1']` absent — the stills seed in memory only. Test in Task 1 and Task 4.
2. **A still whose own logic navigates** (the splash after its animation, onboarding's buttons) must stay on its screen. Test in Task 1.
3. **Reset while viewing as Kids** must come back signed out, as Parent (Mamá), at the splash, with «Continue» gone from the doors. Test in Task 3.
4. **An old link `/simulator/#app.kid?kid=p-emi`** must land in the app on that screen with its params, not on the doors. Test in Task 3.
5. **The last onboarding «Continuar» while «See as» is Kids** must end on Mamá's home as Mamá. Test in Task 2.

---

### Task 1: «Still» mode in sim.js, and a viewer per state

**Files:**
- Modify: `simulator/sim.js` (host detection ~l.40, `WB` object ~l.44, `read()`/`write()` ~l.66–82, `WB.go` ~l.400)
- Modify: `simulator/tools/build-screens.mjs` (`loadCatalog` state checks; the `generate()` index)
- Modify: `simulator/catalog/family.json` (`app.kid` · `missed`: add `"as": "p-mama"`)
- Modify: `simulator/CONTRACT.md` §3 (state `as`), §5 (`WB.still`)
- Test: `simulator/tests/still.spec.mjs` (new)

**Interfaces:**
- Produces: a page opened with `?still=1&as=<personId>` → `WB.still === true`, `WB.isHost === false`, `WB.embedded === false`; `WB.viewAs.get().person === <personId>`; `WB.go()` does nothing; the world is a fresh `shell-base` seed held in memory (never `localStorage`), its theme read from the saved store when one exists; writes update the in-memory copy only.
- Produces: catalog states may carry `"as": "<personId>"`; `build-screens` fails when it is not a `shell-base` person. `WB.index.flowTitles` → `{ "simulator/flows/first-open.md": { title: "First open", order: 1 }, … }` (title = the doc's `# ` heading before « — »; order = front matter `order:`, default 99).

- [ ] **Step 1: Write the failing tests** in `tests/still.spec.mjs` (open the screen file directly, no shell):
  - `test('a still never navigates and never saves')`: clear storage; `goto('/simulator/screens/app/splash?still=1&as=p-mama')`; wait 7000 ms; `expect(page.url()).toContain('splash')`; `expect(await page.evaluate(() => localStorage.getItem('cs-sim/v1'))).toBeNull()`; `expect(await page.evaluate(() => WB.still)).toBe(true)`.
  - `test('a still sees as its person, whatever See as says')`: seed storage by visiting `/simulator/app.html` and `WB.viewAs.set('p-mama')`; `goto('/simulator/screens/app/kid?kid=p-sofia&still=1&as=p-sofia')`; `expect(await page.evaluate(() => WB.viewAs.get().person)).toBe('p-sofia')`; then `evaluate(() => JSON.parse(localStorage.getItem('cs-sim/v1')).ctx.viewAs.person)` is still `'p-mama'`.
- [ ] **Step 2: Run** `cd simulator/tests && npx playwright test still.spec.mjs` — Expected: FAIL (`WB.still` undefined, URL moves to onboarding).
- [ ] **Step 3: Implement** still mode in `sim.js`: parse `still`/`as` from `location.search` before host detection; a still has no host; `read()` seeds `WB.index.defaultScenario` into the cache (viewAs = `as`) instead of reading storage; `write()` keeps it in the cache and emits, never `lsSet`; `WB.go` returns early; expose `WB.still`. In `build-screens.mjs`: check state `as` against `shell-base` people; add `flowTitles` from `flows/*.md`. Add `"as": "p-mama"` to `app.kid · missed`; add `order: 1|2|3` to the front matter of `first-open`, `daily-loop`, `prizes`.
- [ ] **Step 4: Run** `node tools/build-screens.mjs && npx playwright test still.spec.mjs` — Expected: PASS; then the whole suite and `pnpm check` — PASS.

### Task 2: Onboarding ends in Mamá's home (stand-in for sign-up)

**Files:**
- Modify: `simulator/logic/start.js` (`app.onboarding` cta's last step and `onboarding-sign-in`)
- Modify: `simulator/flows/first-open.md` (step 3, «Not built yet»), `simulator/DECISIONS.md` (new row **F7**)
- Test: `simulator/tests/start.spec.mjs` (new)

**Interfaces:**
- Consumes: `WB.session.signIn(personId)` (also sets «See as»), `WB.go(id)`.
- Produces: last «Continuar» and «¿Ya tienes cuenta? Inicia sesión» → `WB.session.signIn('p-mama'); WB.go('app.today')`.

- [ ] **Step 1: Write the failing test** `test('the last Continuar signs in as Mamá and opens her home, even from Kids')`: `openShell(page)`; `evaluate(() => { WB.reset(); WB.viewAs.set('p-sofia'); WB.session.signOut(); })`; `open(page, 'app.onboarding', {}, 'slide-4')`; click `[data-od-id="onboarding-cta"]` in the frame; `waitHere(page, 'app.today')`; `expect(evaluate(() => [WB.session.get().signedIn, WB.viewAs.get().person])).toEqual([true, 'p-mama'])`. Same for `[data-od-id="onboarding-sign-in"]` from slide-1.
- [ ] **Step 2: Run** `npx playwright test start.spec.mjs` — Expected: FAIL (lands on `dev.missing`).
- [ ] **Step 3: Implement** in `logic/start.js`; flow doc step 3: «the last «Continuar» and «Inicia sesión» enter as Mamá (stand-in, DECISIONS F7)»; «Not built yet: sign-up and sign-in». F7 row: «Until sign-up and sign-in exist, the end of onboarding enters as Mamá | owner: «enter as parent, I will work on the design later» | `logic/start.js`, flows/first-open.md».
- [ ] **Step 4: Run** the spec, the suite, `node tools/check-flows.mjs --stamp`, `pnpm check` — PASS.

### Task 3: The doors page and the app at `app.html`

**Files:**
- Create: `simulator/app.html` (today's `index.html`, title «ChickenStreaks Simulator»)
- Modify: `simulator/index.html` → the doors page (loads `sim.js`, `shell/pages.css`, `shell/doors.js`)
- Create: `simulator/shell/doors.js`, `simulator/shell/pages.css` (pages' layout; loaded after `shell.css`; `body.sh-page{overflow:auto}`)
- Modify: `simulator/shell/shell.js` (`defaultScreen`, `reset()`, boot: `?from=splash`; the brand links to `/simulator/`)
- Modify: `simulator/tools/hot-serve.mjs` (`transformHtml`: inject the hot client into `/simulator/index.html`, `/simulator/app.html`, `/simulator/gallery.html`; the watcher comment)
- Modify: `simulator/tests/helpers.mjs` (`openShell` → `'/simulator/app.html' + hash`), `simulator/tests/family.spec.mjs` («Reset» test)
- Modify: `simulator/flows/shell-header.md`, `simulator/README.md`, `simulator/AGENTS.md` (first paragraph), `simulator/CONTRACT.md` §0
- Test: `simulator/tests/doors.spec.mjs` (new)

**Interfaces:**
- Consumes: `WB.session.get()`, `WB.session.signOut()`, `WB.reset()`.
- Produces: doors page — `[data-testid="door-app"]` with buttons `door-continue` (only when `localStorage['cs-sim/v1']` exists **and** `WB.session.get().signedIn`), and `door-start` (label «Start» without saved progress, «Start from the splash» with it) → `app.html?from=splash`; `[data-testid="door-screens"]` → `gallery.html`. A hash on `/simulator/` → `location.replace('app.html' + location.hash)`.
- Produces: `app.html?from=splash` → shell signs out, opens `app.splash`, drops the query (`history.replaceState`). First visit (no `prefs.lastApp`) → `app.splash`. `reset()` → `WB.reset(); WB.session.signOut(); prefs.lastApp = null`, routes cleared, opens `app.splash`, toast «Reset: everything is back to the start».

- [ ] **Step 1: Write the failing tests** in `tests/doors.spec.mjs`:
  - `test('a first visit offers only Start, and Start plays the splash')`: clear storage; `goto('/simulator/')`; `door-continue` hidden; `door-start` has text «Start»; click → URL contains `app` and `WBShell.here().screen === 'app.splash'`.
  - `test('after onboarding the doors offer Continue and Start from the splash')`: via the app finish onboarding (Task 2 path); `goto('/simulator/')`; `door-continue` visible; `door-start` text «Start from the splash»; click Continue → `app.today`.
  - `test('Reset is a new install')`: in the app, `WB.viewAs.set('p-sofia')`; click `sh-reset`; `waitHere('app.splash')`; `[signedIn, person]` = `[false, 'p-mama']`; `goto('/simulator/')` → `door-continue` hidden.
  - `test('an old link opens the app')`: `goto('/simulator/#app.kid?kid=p-emi')` → `waitHere('app.kid')`, `WBShell.current().params.kid === 'p-emi'`.
  - `test('See the screens opens the gallery')`: click `door-screens` → URL contains `gallery`.
- [ ] **Step 2: Run** `npx playwright test doors.spec.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** the move and the doors (doors copy: «Use the app» — «A phone with the test family. It remembers what you do until Reset.»; «See the screens» — «Every screen and state, grouped by flow.»); update the «Reset» test in `family.spec.mjs` to expect `app.splash`, signed out, `p-mama`, 6 chores.
- [ ] **Step 4: Run** the suite, `pnpm check`; restart `pnpm dev` and open http://127.0.0.1:4710/simulator/ — the doors show, both work.

### Task 4: The gallery

**Files:**
- Create: `simulator/gallery.html` (bar: brand → `/simulator/`, a «Use the app» pill → `app.html`; `<main id="sh-gallery">`), `simulator/shell/gallery.js`
- Modify: `simulator/shell/pages.css` (gallery grid, thumbnails)
- Modify: `simulator/flows/shell-header.md`, `simulator/README.md`
- Test: `simulator/tests/gallery.spec.mjs` (new)

**Interfaces:**
- Consumes: `WB.index.screens`, `WB.index.flowTitles` (Task 1), `WB.href(id, params)`, still mode (Task 1).
- Produces: one `<section data-testid="gal-group">` per flow, ordered by `flowTitles[].order` (no flow → «Other», last; `dev.*` left out); per state a `<a data-testid="gal-item" href="app.html#<screen>?<params>[&estado=<state> when drive]">` with a 390×844 iframe scaled 0.4, `loading="lazy"`, `src = WB.href(screen, params + (drive ? {estado} : {}) + {still: 1, as: viewer})`, and the screen's and state's titles. `viewer(state) = state.as || (kid = people[state.params.kid], kid && kid.paired ? kid.id : 'p-mama')`.

- [ ] **Step 1: Write the failing tests** in `tests/gallery.spec.mjs`:
  - `test('every state of every app screen, grouped by flow, in order')`: `goto('/simulator/gallery.html')`; group headings `['First open', 'The daily loop', 'Prizes']`; `gal-item` count equals the sum of states of non-`dev.*` screens in `screens.json`.
  - `test('a first visit to the gallery saves nothing')`: clear storage; `goto(gallery)`; wait 7000 ms; `localStorage.getItem('cs-sim/v1')` is null; the splash thumbnail's frame URL still contains `splash`.
  - `test('a thumbnail opens its screen in the app')`: click the item for `app.onboarding · slide-3` → `waitHere('app.onboarding', 'slide-3')` in `app.html`.
- [ ] **Step 2: Run** `npx playwright test gallery.spec.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** `gallery.html` + `shell/gallery.js` + styles (thumbnails in the shell's phone look: 5 px dark bezel, 22 px radius; titles under each; the theme follows the saved one, no Theme pills here).
- [ ] **Step 4: Run** the suite and `pnpm check`; open http://127.0.0.1:4710/simulator/gallery.html in dark and light; screenshot to check nothing overlaps at 1440 and 390 px.
