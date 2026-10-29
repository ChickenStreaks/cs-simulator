# Decisions — what the simulator was built on

The product rules are `blueprint/product/`; they win. This file holds only what the simulator needed and the
rules do not say yet. «Ver lo por decidir» lists every row of «Provisional» and every open question of the flows.
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

## Open

- (none yet beyond the flows' «Open questions»)
