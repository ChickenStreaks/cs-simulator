# Glossary — one cast, one vocabulary

The words are the blueprint's (`blueprint/product/definicion.md`); this file adds the simulator's cast and the
names its data uses. Screens speak Mexican Spanish; code and flow docs, English.

## The cast — `scenarios/shell-base.json`, «La familia Rivera»

| Id | Who | Notes |
|---|---|---|
| `p-mama` | Lucía, «Mamá» | adult; the default «Ver como» |
| `p-papa` | Carlos, «Papá» | adult |
| `p-sofia` | Sofía, «Sofi», 7–9 | paired phone; 5-day streak; «Tender su cama» waits for approval today |
| `p-mateo` | Mateo, 10–12 | paired phone; 3-day streak; «Sacar la basura» approves itself |
| `p-emi` | Emi, 4–6 | no phone: an adult marks for Emi (familia R10) |

Fictional data only; e-mails end in `@correo.ejemplo`. A kid holds a name, avatar and age range, nothing else
(familia R8): the build refuses a birthdate or a photo.

## Words on screen

| Concept | Spanish | Data |
|---|---|---|
| chore | tarea | `chores[]` { name, icon, kids, days 0–6 (0 = domingo), eggs 1–50, autoApprove } |
| mark | «¡Lo hice!» / «Marcar hecha» | `marks[]` { chore, kid, day, at, by, status } |
| waiting | «En espera» | mark `status: 'pending'` |
| approved | «Aprobada», «Aprobada por Mamá», «Se aprobó sola» | `status: 'approved'`, `approvedBy` (a person or `'auto'`), `eggs` |
| repeat | «Repetir» (adult) · «Repítela», «¡Ya quedó!» (kid) | `status: 'redo'` — never «rechazar» (tareas R12) |
| eggs | huevos 🥚 | derived: `CSCore.eggs` — never stored |
| streak | racha 🔥 | derived: `CSCore.streak` |
| wildcard | comodín 🛡️ | derived |
| forgive | «Perdonar el día» | `forgives[]` { kid, day, by } |
| pause | pausa | `pauses[]` { kid, from, until } (no screen yet) |
| prize | premio | `prizes[]` { kid, name, price } |
| redeem | «Canjear» → «Por entregar» → «Entregado» | `redemptions[]` { prize, kid, price, status `to-deliver` · `delivered` } |
| hen | gallina: pollito · pollita · gallina · gallina dorada | derived: `CSCore.stage` |

Never: «perder la racha», countdowns, red zeros, «castigo», rankings between siblings (rachas R13, meta-familiar R4).

## Roles and verbs — `WB.can(verb, { kid }?)`

| Role | Verbs |
|---|---|
| `adult` | `view` `chore.create` `chore.edit` `chore.mark` `approve` `forgive` `pause` `lovi` `prize.create` `prize.deliver` `goal.create` `kid.create` `pair` |
| `kid` | `view` `chore.mark` `prize.redeem` — on their own things only (code `other-kid`) |

Codes when not allowed: `no-access` (not in the family), `role`, `other-kid`.
