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
| **F5** | `screens/tokens.css` is a copy of Open Design's generated CSS; the screens' `--cs-*` names are aliases of it | `blueprint/design/tokens/` is JSON, which a screen cannot link; same values | `screens/tokens.css` |
| **F6** | The splash plays Open Design's whole hatching animation (≈ 5.4 s), with no logo or text, then opens the slides | the owner asked for the Open Design splash; `pantallas/splash.md` says gone as soon as the app knows | `screens/app/splash.html`, `logic/start.js`, flows/first-open.md |
| **F7** | Accounts are pretend: any adult who finishes sign-up or signs in enters as Mamá and opens her home | the simulator has one family; there is no family set-up yet, so «Configurar mi familia» stands in | `logic/start.js`, flows/access.md |
| **F8** | The Bienvenida is Open Design's v2: one bird grows from egg to hen across the four slides, with `screens/cs.css` (its component CSS, an unchanged copy) | the owner asked for it; the slides' words stay the blueprint's (`pantallas/onboarding.md`), the sample cards are illustration. The owner also asked for Open Design's handoff: the splash's hen lifts away and leaves the egg | `screens/app/onboarding.html`, `logic/start.js`, flows/first-open.md |
| **F9** | Acceso is Open Design's, with a first screen the blueprint does not have («¿Quién va a usar este teléfono?»), an e-mail code, an adult-consent step, password recovery by code («Preparando tu granja…» on the way) and a kid's way in by code | the owner asked for it; `flows/primer-uso.md` only says «registro o inicio de sesión» | `screens/app/access.html`, `logic/start.js`, flows/access.md |
| **F10** | Acceso's kid code belongs to one kid and opens that kid's greeting; Open Design's family code and «¿Quién eres?» list were left out, as were its egg colors per kid | familia R12 (a code for one kid) and R8 (a profile has no color) win over the design | `screens/app/access.html`, `logic/start.js`, flows/access.md |
| **S1** | «See as» offers only Parent (Mamá) and Kids (always Sofía) | the owner asked for a simpler header; Papá, Mateo and Emi are reached from the console (`WB.viewAs.set`) | `shell/shell.js` AS, flows/shell-header.md |

## Open

- `app.approvals`: ¿«Repetir» pide un motivo, o basta con el toque? (and the flows' «Open questions»)
- `app.access`: ¿un código por hijo (familia R12, lo construido) o un código de familia y luego «¿Quién eres?» (Open Design)? Si es el segundo, cambia primero el blueprint.
