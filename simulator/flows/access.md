---
id: access
actor: an adult creating an account or signing in, or a kid linking a phone
trigger: the end of the slides («Continuar» or «Inicia sesión»)
status: draft
order: 1
last checked against the simulator: 2ad80d2
---

# Access — sign-up, sign-in and a kid's code

Screen: `app.access` (Open Design's Acceso; DECISIONS F9). Accounts and codes are pretend: nothing leaves the page.
Every 6-number code (e-mail, recovery, kid) is typed into six rounded, tonal boxes; a wrong one turns their borders violet
(Open Design 1.3.0, decision 35).
Practice values: e-mail code `123456` (sign-up and password recovery); Sofía's code `482936`, Mateo's `735924`; a taken e-mail is any of the cast's, such as
`lucia@correo.ejemplo`; the wrong password is `incorrecta`.

## Steps

1. **Who** — «¿Quién va a usar este teléfono?»: two halves of the screen, adult or kid; the chick hops before moving on.
   The back arrow returns to the slides.
2. **Adult, new** (from «Continuar»; steps «1 de 3» to «3 de 3») — e-mail and password of 8 or more (the hen on top closes her
   eyes while a hidden password is being typed); the 6-number e-mail code, checked by itself on the sixth number (it can be sent
   again after 30 s, or «Cambiar correo» goes back); two unticked boxes, adult and privacy notice (privacidad R1), with the notice
   one tap away; «Preparando tu granja…» for a moment; «Tu cuenta está lista.»; «Configurar mi familia» enters as Mamá and opens `app.today` (stand-in, DECISIONS F7). Whoever signs up creates the family (familia R1).
3. **Adult, returning** (from «Inicia sesión») — e-mail and password, then in as Mamá. «¿Olvidaste tu contraseña?» asks for the
   e-mail and always answers the same, whether or not the account exists; then the 6-number code, a new password, «Tu contraseña
   está lista.» and back to sign-in.
4. **Kid** — six numbers on a keypad. The code belongs to one kid (familia R12), so it greets that kid: «¡Hola, Sofi!», their egg,
   «Ver mis tareas» signs in as the kid and opens `app.kid` (DECISIONS F10). «No tengo código» asks for an adult, who can
   go on to sign-up from there.

## Failure cases

- F-1 E-mail empty or malformed, or password too short: said under the field; the first wrong field takes the focus.
- F-2 E-mail already has an account: said under the field, with a link that carries it to sign-in.
- F-3 Wrong e-mail code (the cells rock and empty), or wrong password: said under the field, nothing else changes.
- F-4 A box left unticked: «Marca las dos casillas para continuar.»
- F-5 Wrong kid code: the slots rock and empty, and «Ese código no es. Revísalo otra vez.»

## Configurable settings

| Id | Setting | Default | Limits | Changed by | Rule |
|---|---|---|---|---|---|
| (none) | | | | | |

## Not built yet

- Family set-up after sign-up; a real account of one's own (DECISIONS F7).
- Linking a kid by QR; a code's 10-minute expiry, single use and attempt limit; the adult generating the code (familia R12).
- Keeping the consent's date, notice version and method (privacidad R2).
- The real privacy notice: the words on screen are a sample, in Spanish only (privacidad R8).

## Open questions

- One code per kid (built, familia R12) or a family code and then «¿Quién eres?» (Open Design)? (DECISIONS, Open)
