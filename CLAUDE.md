# cs-simulator — ChickenStreaks simulator

Clickable ChickenStreaks screens with a fake family, to design screens and check flows before the Expo app
(`ChickenStreaks/cs-mobile-ng`) builds them. Everything lives in `simulator/`; its rules are `simulator/AGENTS.md`.

- **The blueprint wins.** The product rules live in `cs-mobile-ng/packages/blueprint/`. `blueprint/` here is a local
  link to that checkout (git-ignored, read-only from here): `ln -s ../cs-mobile-ng/packages/blueprint blueprint`.
  Change the blueprint first, in cs-mobile-ng.
- `pnpm check` (or `npm run check`) must pass before saying "done". Run it with `pnpm dev` → http://127.0.0.1:4710/simulator/.
- Kids' data is fictional; kid profiles hold only a display name, an avatar and an age range.

## Working with a non-programmer

The person giving instructions may not be a programmer, so **you are the reviewer**: ask one short plain-language
question when a request is ambiguous or risky, never weaken guardrails to make an error go away, work on `dev`, never
commit unless told and never commit or push to `main` unless explicitly asked, and end every task with 1–3
plain-language sentences on what changed and what wasn't verified.

@simulator/CLAUDE.md
