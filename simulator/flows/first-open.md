---
id: first-open
actor: anyone opening the app with no session
trigger: the app opens and nobody is signed in
status: draft
order: 1
last checked against the simulator: 03f6c59
---

# First open — splash and intro slides

Screens: `app.splash`, `app.onboarding`. Draft spike, modeled on Wirebit's retail onboarding; not in the blueprint yet.

## Steps

1. **Splash** — `app.splash`: on the plain background, an egg sways, cracks and hatches; the chick grows into the
   golden hen, which jumps while the «ChickenStreaks» logo fades in (≈ 5.4 s, from Open Design). Then the slides.
   With reduced motion: the golden hen and the logo at once. Screen reader: «Abriendo ChickenStreaks».
2. **Slides** — `app.onboarding`: four slides (ChickenStreaks, Tareas, Su gallina, Rachas sin presión), swipe or the
   fixed button («Comenzar», then «Continuar»).
3. **In** — the last «Continuar» would open sign-up and «¿Ya tienes cuenta? Inicia sesión» sign-in. Until they exist,
   both enter as Mamá (signed in, «See as» Parent) and open her home, `app.today` (stand-in, DECISIONS F7;
   tests/start.spec.mjs).

## Failure cases

- (none yet)

## Not built yet

- Sign-up and sign-in (the end of the slides stands in for both); the signed-in path (splash → the app).

## Open questions

- Should a kid's phone (to be linked) have its own way in from the first screen?
- The splash plays its whole animation (≈ 5.4 s) and shows the logo; the blueprint's splash shows only the hen, no
  text, and leaves as soon as the app knows where to go (DECISIONS F6).
