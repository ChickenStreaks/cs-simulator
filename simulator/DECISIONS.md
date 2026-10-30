# Decisions — what the simulator was built on

The product rules are `blueprint/product/`; they win. This file holds only what the simulator needed and the
rules do not say yet.
Never decide an open one: ask the owner, and change the blueprint first when the answer is a rule.

## Provisional

Built this way so the screens can be tried; to confirm with the owner.

| Id | Decision | Why | Where |
|---|---|---|---|
| **F1** | A streak milestone (7, 14, 30 days) is worth 10 eggs | rachas R11 gives no number | `world.settings.milestoneEggs`, flows/daily-loop.md |
| **F2** | A milestone pays each time a streak run reaches it, not once ever | «bonificación única» reads both ways | `logic/family-core.js` streak() |
| **F3** | A kid starts with no wildcard | rachas R5 says how they are earned, not the start | `logic/family-core.js` streak() |
| **F4** | The hen sleeps after 3 days with no marks | gallina R5 says «en un tiempo» | `logic/family.js` app.kid |
| **F5** | The screens use draft tokens copied from the visual brief | `blueprint/design/tokens/` is still empty | `screens/tokens.css` |
| **F6** | The splash plays Open Design's hatching animation (≈ 5.4 s) and shows the «ChickenStreaks» logo, then opens the slides | the owner asked for the Open Design splash; `pantallas/splash.md` says only the hen, no text, and gone as soon as the app knows | `screens/app/splash.html`, `logic/start.js`, flows/first-open.md |
| **F7** | Until sign-up and sign-in exist, the end of the slides («Continuar», «Inicia sesión») enters as Mamá and opens her home | the owner: «enter as parent, I will work on the design later» | `logic/start.js`, flows/first-open.md |
| **S1** | «See as» offers only Parent (Mamá) and Kids (always Sofía) | the owner asked for a simpler header; Papá, Mateo and Emi are reached from the console (`WB.viewAs.set`) | `shell/shell.js` AS, flows/shell-header.md |

## Open

- `app.approvals`: ¿«Repetir» pide un motivo, o basta con el toque? (and the flows' «Open questions»)
