---
id: shell-header
actor: a person trying the simulator (not a family member)
trigger: the simulator opens; the bar stays on top of every screen
status: draft
last checked against the simulator: 03f6c59
---

# The simulator's shell — the doors, the bar and the console

The simulator opens on two doors (`index.html`, `shell/doors.js`; specs/2026-10-30-two-doors-design.md): «Use the app»
(`app.html`) and «See the screens» (`gallery.html`). The app is the device frame and one bar, in English (the app's screens stay in Mexican Spanish). Code:
`shell/shell.js`. Kept bare on purpose (owner, 2026-10-30): no stories, «What if», clock button, comments or menu;
the rest is done from the browser console with `WB` and `WBShell` (README «From the console»).

## Steps

0. **The doors** — `/simulator/`. «Use the app»: «Start» the first time (the app never used, or only its splash
   since a Reset), else «Continue» (back to the last screen) and «Start from the splash» (`app.html?from=splash`:
   signs out, plays the splash; the family's data stays). «See the screens» opens the gallery. An old link
   `/simulator/#<screen>` opens the app there.
   The app's first visit opens the splash; the hen in the bar goes back to the doors (tests/doors.spec.mjs).
   **The gallery** (`gallery.html`, `shell/gallery.js`): every state of every app screen as a small live phone, grouped
   by flow (the flow docs' `order:`, then the catalog's order), each with the screen's and the state's names. A
   thumbnail is a still (sim.js `?still=1&as=`): the standard family seen as the state's person (`as` in the catalog,
   else the kid when it has a phone, else Mamá); it never moves on and never saves. A click opens that screen and state
   in the app, with the visitor's own data (tests/gallery.spec.mjs).
1. **The bar** — the hen and «ChickenStreaks Simulator» (back to the doors) · «See the screens» (the gallery) · «See as»
   and «Theme», each its own pill of choices · «Reset». The gallery's bar has «Use the app» back.
   Night blue in both themes (the app's «Fogata refinada» palette, egg yellow only for focus and hover), so it never
   reads as part of the app. Narrower: «Simulator» goes (980 px), then the name (820 px),
   then the pills' labels and Reset's word (560 px).
2. **See as** — two pills, two choices only (S1 in DECISIONS.md): «Parent» shows Mamá's phone (the parent mode, `app.today`),
   «Kids» shows Sofía's (`app.kid`). Switching mode opens that mode's home; a toast says «Now seeing as …».
3. **Theme** — two pills, Light or Dark: the shell and the screen change together (`WB.theme.set`). A first visit
   follows the system («auto»); the pressed pill is what is on screen.
4. **Reset** — one tap, no confirmation (the family is fictional), like a new install (owner): the base family, the
   clock back to now, signed out, «Parent», the back history and the last screen forgotten, then the splash; the doors
   offer only «Start» again. The theme stays. A toast says «Reset: everything is back to the start».
5. **Above the device** — the phone: iPhone 15 or Android.
6. **The console** — `WB.reset(scenario?)` starts over or loads another scenario, `WB.clock.advance('1h' | '24h' | '1d')` moves time,
   `WB.viewAs.set(personId)` shows anyone of the family, `WBShell.open(id, params)` opens a screen.

## Failure cases

- Someone set from the console who is not Mamá or Sofía (Papá, Mateo, Emi): the switch reads «Parent» or «Kids» by
  their role.

## Settings

- None.

## Open questions

- (none)
