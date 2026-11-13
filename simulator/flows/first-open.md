---
id: first-open
actor: anyone opening the app with no session
trigger: the app opens and nobody is signed in
status: draft
order: 0
last checked against the simulator: 6f6ff8e
---

# First open — splash and intro slides

Screens: `app.splash`, `app.onboarding`. Draft spike, modeled on Wirebit's retail onboarding; not in the blueprint yet.

## Steps

1. **Splash** — `app.splash`: on the plain background, an egg sways, cracks and hatches; the chick grows into the
   golden hen, which jumps (≈ 5.4 s, from Open Design; no logo, no text). Then the slides: the hen glides up and lifts away, leaving
   the egg of the first slide, and the text and the button fade in.
   With reduced motion: the golden hen at once. Screen reader: «Abriendo ChickenStreaks».
2. **Slides** — `app.onboarding` (Open Design's Bienvenida v2): four slides (ChickenStreaks, Tareas, Su gallina, Rachas sin
   presión), swipe, arrow keys or the fixed button («Comenzar», then «Continuar»). One bird stays in place while the cards and
   text slide beneath it: egg, chick (it hatches), young hen, hen (it jumps, once). It changes only when a slide commits;
   going back it only fades. The fourth slide's wildcard is the loose-straw cushion (`cojin-heno.png`, Open Design system 1.2.0). With reduced motion: instant changes, no rock, hatch or jump (DECISIONS F8; tests/start.spec.mjs).
3. **In** — the last «Continuar» opens sign-up and «¿Ya tienes cuenta? Inicia sesión» sign-in, both through `app.access`
   (flows/access.md; tests/start.spec.mjs).

## Failure cases

- (none yet)

## Not built yet

- The signed-in path (splash → the app).

## Open questions

- The splash plays its whole animation (≈ 5.4 s); the blueprint's splash leaves as soon as the app knows where to go
  (DECISIONS F6).
