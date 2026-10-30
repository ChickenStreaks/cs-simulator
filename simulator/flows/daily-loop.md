---
id: daily-loop
actor: adult (Papá, Mamá) and kid
trigger: a new day with chores
status: draft
order: 2
last checked against the simulator: 03f6c59
---

# The daily loop — assign, mark, approve

An adult gives a kid chores; the kid marks them done; an adult approves; the kid earns eggs, the streak counts the day
and the hen grows. Screens: `app.today`, `app.approvals`, `app.chores`, `app.chore-new`, `app.kid`. Prizes are
[prizes.md](prizes.md).

## Steps

1. **The adult's day** — `app.today`. Each kid with today's progress («2 de 3 hoy»), streak and eggs; a kid with a
   missed day the adult can still forgive says «Faltó un día». The button «Aprobar N tareas» opens the inbox; with
   nothing waiting it reads «Nada por aprobar» (state `all-approved`). Tapping a kid opens `app.kid?kid=…`.
   Verification: the counts come from `CSCore` (logic/family-core.js), never stored.
2. **Create a chore** — `app.chores` → «Nueva tarea» → `app.chore-new` (an operation, `WB.flow`: «←» cancels to where
   it started; saving returns there). For whom (one or more kids), suggestions by the first kid's age (tareas R3, values
   fácil 5 · media 10 · difícil 20, huevos R2), name, days, eggs 1–50 (a written chore starts at 10), «Se aprueba sola»
   (tareas R10). Only adults (tareas R1). A risky word shows «¿Es seguro para su edad? Considera acompañarlo» and never
   blocks (tareas R4, state `safety`). The chore counts from the day it is created.
3. **The kid marks it** — `app.kid` on the kid's phone. Today's chores: «¡Lo hice!» → «⏳ En espera» (tareas R8; state
   `waiting`). A chore that approves itself goes straight to «✓ Aprobada». The day already counts for the streak once
   every chore is marked, approved or not (rachas R1, R2).
4. **An adult marks for a kid with no phone** — `app.kid?kid=p-emi` as an adult: «Marcar hecha», approved at once
   (tareas R6, familia R10).
5. **Approve** — `app.approvals`: one inbox for every kid (tareas R9), «Aprobar todo» with two or more, a praise to
   pick that describes what the kid did (tareas R11), «Aprobar» or «Repetir». Approving signs it: «Aprobada por Mamá»
   (familia R4); the first action wins (familia R5). Eggs arrive on approval (huevos R1). Empty inbox: state `empty`.
6. **Repeat, not reject** — «Repetir» (tareas R12): the kid sees «↻ Repítela» and «¡Ya quedó!», no eggs lost, no
   punishment; the day is open again until it is marked.
7. **Nobody approved** — a mark pending 24 hours approves itself when the clock passes it: «Se aprobó sola» (tareas
   R10). From the console: a mark pending 23 hours, then `WB.clock.advance('1h')` (tests/family.spec.mjs).
8. **The streak and the hen** — `app.kid`: the age decides what leads (rachas R12): 4–6 no number («¡Tu gallina está
   contenta!»), 7–9 the week («5 de 7 días») with the streak second, 10+ the streak number with wildcards and the best.
   A wildcard is earned every 7 days, at most 2, and saves a missed day by itself (rachas R5; the week bar shows it
   striped). Milestones 7, 14, 30 add a one-off bonus (rachas R11). The hen's stage follows the total of approved
   chores and never goes back (gallina R2, R3); with no marks in 3 days she sleeps (gallina R5).
9. **A missed day** — with no wildcard, an adult opening `app.kid` sees «Sofía no completó el martes» and «Perdonar el
   día» within 48 hours (rachas R7; state `missed`). Not forgiven, the streak starts over gently: «¡Empecemos de nuevo!
   Tu récord fue N días», no zero in red (rachas R10, R13).

## Failure cases

- **F-1** A kid opens a parent screen (`app.today`, `app.approvals`, `app.chores`, `app.chore-new`): «Esto es para
  papás» with «Ir a mi día» (state `no-access`).
- **F-2** A kid opens another kid's day: «Este no es tu día» (state `no-access`).
- **F-3** `app.kid` with an unknown kid: «No encontramos a este hijo» (state `not-found`).
- **F-4** A day with no chores: «Hoy no hay tareas» — it neither counts nor breaks (rachas R3, state `rest`).

## Configurable settings

| Id | Setting | Default | Limits | Changed by | Rule |
|---|---|---|---|---|---|
| wildcard-max | Comodines guardados | 2 | 0–5 | server config | rachas R5 |
| wildcard-every | Días de racha por comodín | 7 | 1–30 | server config | rachas R5 |
| milestones | Hitos de racha | 7, 14, 30 | — | server config | rachas R11 |
| milestone-eggs | Huevos por hito | 10 | 1–100 | server config | rachas R11 |
| auto-approve-hours | Aprobación automática | 24 h | 1–72 h | server config | tareas R10 |
| hen-stages | Etapas de la gallina | 10, 50, 150 | — | server config | gallina R2 |

## Not built yet

Pause (rachas R6) and repair (rachas R8) live in `CSCore` and its test but have no screen; reminders and the 19:00
summary (avisos R2, R5); «Lo vi»; the family goal; parenting tips (tareas R13).

Built on provisional choices, to confirm: F1 (10 eggs a milestone), F2 (a milestone pays each run), F3 (no wildcard
at the start), F4 (the hen sleeps after 3 days) — `DECISIONS.md`.

## Open questions

- Does «Repetir» ask the adult for a reason, or is the tap enough?
