# The simulator contract — `WB` v1

Every screen plugs into the shell through this file. The code is `sim.js`; the API keeps Wirebit's name `WB` (the
simulator is a port of Wirebit's), so its shell, tools and tests work unchanged. Paths below are relative to
`simulator/`; the server serves it as `/simulator/` and the blueprint, read-only, as `/blueprint/`.

## 0. Where things live

| Path | What |
|---|---|
| `sim.js`, `index.html`, `app.html`, `gallery.html`, `shell/` | the `WB` API; the doors, the app (the device frame and the bar), the gallery |
| `catalog/<lane>.json` | the screens and their states (§3) |
| `scenarios/<lane>-<name>.json` | worlds (§4) |
| `logic/family-core.js` | the rules as pure functions (`CSCore`), tested by `logic/family-core.test.cjs` |
| `logic/<lane>.js` | the screens' wiring: `WB.wire` |
| `screens/app/<name>.html` | the look only, with `data-od-id`s; `_app.css` and `../tokens.css` are shared |
| `flows/<flow>.md` | the walked flows (§6) |
| `screens.json`, `generated/` | **generated** by `tools/build-screens.mjs`; never hand-edit |

## 1. A screen page

```html
<!doctype html>
<html lang="es-MX">
<head>
<meta charset="utf-8">
<script src="/simulator/sim.js"></script>   <!-- FIRST, plain and blocking -->
<link rel="stylesheet" href="/simulator/screens/tokens.css">
<link rel="stylesheet" href="_app.css">
```

- `sim.js` loads the generated index, then every `logic/*.js`, then boots the store; the page's scripts can use `WB`.
- **Params:** `WB.params`. `?kid=p-…` says which kid a screen is about (`WB.context()` → `{ kid }`); `?estado=<state>`
  opens a designed state. Navigate with `WB.go('app.kid', { kid: 'p-emi' })`.
- **Theme:** `sim.js` sets `<html data-theme="light|dark">`; `tokens.css` follows it. Dark is the main mode.

## 2. `data-od-id`

Every element a test or the logic points at has a stable `data-od-id`, prefixed by the screen
(`kid-hero`, `kid-mark-ch-sofia-cama`, `approval-ok-mk-…`). Never derived from text or position. The logic finds
elements by them, so a designer's screen can replace the HTML without touching the logic.

## 3. Catalog — `catalog/<lane>.json`

```json
{ "lane": "family", "screens": [ {
  "id": "app.kid", "title": "El día del hijo", "area": "app", "design": "draft",
  "file": "simulator/screens/app/kid.html", "flow": "simulator/flows/daily-loop.md",
  "states": [ { "id": "default", "title": "Tareas por hacer", "params": { "kid": "p-emi" } },
              { "id": "missed", "title": "Faltó un día (adulto)", "drive": true, "params": { "kid": "p-sofia" }, "as": "p-mama" } ],
  "undecided": [ { "question": "¿…?", "ref": "simulator/DECISIONS.md#open" } ] } ] }
```

- `id`: `app.<name>` (`dev.<name>` for the shell's own pages). `design`: `"draft"` until a designer's screen lands.
- `states`: every designed state; each must render with no error (`tests/states.spec.mjs`). A `"drive": true` state is
  shown with `?estado=<id>`: the logic previews it read-only (`PREVIEW` in `logic/family.js`: another viewer or a
  changed copy of the world), never writing the store.
- `as` (optional): whose eyes the gallery shows the state through, a person of `shell-base`. Without it: the kid in
  `params` when that kid has a phone, else Mamá.

## 4. Scenarios — `scenarios/*.json`

A scenario is one complete world; extend the base (`"extends": "shell-base"`): collections merge by `id`,
`{ "id", "_delete": true }` removes one. Collections: `people`, `chores`, `marks`, `prizes`, `redemptions`,
`forgives`, `pauses`, `lovis`, `goals`, plus `settings` (the rules' starting values) and `ext.<lane>`.

- **Times are relative to the visit:** `"now"`, `"-3d"`, `"-50m"`, `"-2d@19:00"` (that day at 19:00, Mexico City).
  A `day` field takes the same and becomes the local date (`"-1d"` → yesterday).
- **A moment, from the console or a test:** `WB.state.patch(ops)` with ops `add` / `set` (`col`, `id`, `fields`) /
  `remove` / `settings`, then `WB.clock.advance("1h" | "24h" | "1d")` and `WBShell.open(screen, params)`.
- `build-screens` checks the shapes: roles, age ranges, eggs 1–50, known kids and chores, no birthdates.

## 5. The `WB` API

| Call | Does |
|---|---|
| `WB.state.get()` · `get(col)` · `get(col, id)` · `list(col, fn?)` | read a copy |
| `WB.state.update(fn(world), label?)` · `patch(ops, label?)` | write; every document is told |
| `WB.state.subscribe(fn)` · `WB.reset(scenarioId?)` | re-render on change · start over |
| `WB.viewAs.get()` · `.person()` · `.set(personId)` · `.role()` | «See as»: an adult sees the parent mode, a kid theirs |
| `WB.context()` → `{ kid }` \| `null` · `WB.setScreenContext({ kid })` | the kid a screen is about |
| `WB.role(personId)` → `'adult'` \| `'kid'` \| `null` · `WB.roleName(role, personId)` → «Papá», «Hija» | |
| `WB.can(verb, { kid }?)` · `WB.can.detail(…)` → `{ allowed, role, code, reason }` | verbs in `GLOSSARY.md` |
| `WB.clock.now()` · `.iso()` · `.day(d?)` → `'YYYY-MM-DD'` (`day(-1)` yesterday) · `.weekday(day)` · `.format()` · `.advance('1h'\|'24h'\|'1d')` · `.onAdvance(id, fn)` | simulated time, forward only; `'1d'` = tomorrow 09:00 |
| `WB.go(id, params?)` · `WB.href(…)` · `WB.back(fallback?)` | navigation |
| `WB.flow.start(name, { fallback })` · `.finish(result)` · `.exit()` · `.cancel()` | an operation returns to where it started |
| `WB.wire(screenId, fn(WB, doc))` · `WB.onState(state, fn)` · `WB.setScreenState(state)` · `WB.here()` | screen wiring; say the designed state whenever it changes |
| `WB.still` — a page opened with `?still=1&as=<person>` | a still (the gallery): the default family in memory, seen as that person; never navigates, never saves |
| `WB.ui.stateScreen(host, { kind: 'no-access'\|'not-found'\|'empty'\|'error', title, text, primary, secondary?, compact? })` | the one full-screen state |
| `WBShell.open(id, params?)` · `WBShell.here()` · `WBShell.current()` | the shell, from the console or a test |
| `CSCore.dueChores` · `dayStatus` · `streak` · `eggs` · `stage` · `canForgive` | the rules (`logic/family-core.js`) |

## 6. Flow docs — `flows/<flow>.md`

A front-matter header (`id`, `actor`, `trigger`, `status`, `last checked against the simulator: <commit>`), numbered
steps citing the blueprint's rules («rachas R7»), failure cases F-n, a `## Configurable settings` table
(Id | Setting | Default | Limits | Changed by | Rule), what is not built yet, and `## Open questions`. Every catalog
screen is named in a flow; `tools/check-flows.mjs` checks it. These are the simulator's walked drafts: when a flow
settles, it moves to `blueprint/product/flows/` (the blueprint wins over the simulator).
