---
id: prizes
actor: kid redeems, adult delivers
trigger: a kid has enough eggs for a prize
status: draft
order: 3
last checked against the simulator: 2ad80d2
---

# Prizes — redeem and deliver

Screens: `app.prizes`, reached from «Premios» in the kid's floating bar on their phone (DECISIONS F11; its nest opens
«¿Qué hiciste?» on Inicio), or from `app.kid` («Ver sus premios») as an adult.

## Steps

1. **The list** — `app.prizes`: the kid's own prizes (huevos R5), each with its price and «≈ N días de tareas»,
   computed from this kid's current chores (huevos R6). The balance is the sum of the records (huevos R4).
2. **Redeem** — the kid taps «Canjear» when the eggs reach (huevos R8). The eggs are set aside at once and the prize is
   «Por entregar» (state `to-deliver`). Without enough eggs the button says «Faltan N» and does nothing; the balance is
   never negative (huevos R1).
3. **Deliver** — an adult opens the kid's prizes and taps «Entregado» (huevos R8). No real money moves (huevos R9).

## Failure cases

- **F-1** A kid opens another kid's prizes: «Estos no son tus premios» (state `no-access`).

## Configurable settings

| Id | Setting | Default | Limits | Changed by | Rule |
|---|---|---|---|---|---|

## Not built yet

Creating and pricing prizes (huevos R5, R7: connection prizes first); the immediate notice to the adult (avisos R6).

## Open questions

- Can a kid cancel a redemption before it is delivered?
