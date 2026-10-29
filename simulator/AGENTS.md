# AGENTS.md — working inside `simulator/`

The ChickenStreaks simulator: the app (phone) as clickable HTML screens with a fake family, inside a visitor shell
where people try stories, switch «Ver como», move the clock and comment in place. It is where screens are designed and
flows are checked before the Expo app builds them. Ported from Wirebit's simulator.

## Binding rules

1. **The written flows move with the simulator — in the same change.** Any change to a screen, its logic, a scenario,
   a story or a rule updates its flow doc in `flows/` (steps, failure cases, settings, open questions) and its header
   line «last checked against the simulator» (`node tools/check-flows.mjs --stamp`), and `DECISIONS.md` if a decision
   moved. A change no flow describes means the flow is missing: write it. A pure refactor passes with
   `--allow "<reason>"` and the line `Flows unchanged: <reason>` in its commit message.
2. **The blueprint wins.** `blueprint/product/` is read here, never changed from here. A screen that needs a
   rule the blueprint does not have goes to `DECISIONS.md` («Provisional» if built to try it, «Open» if not) and to the
   owner; the blueprint changes first, in its own step.
3. **Write only inside `simulator/`.**
4. **Look apart from logic.** A screen's HTML is the look, with stable `data-od-id`s; what it shows and does lives in
   `logic/<lane>.js` (`WB.wire`); a rule's arithmetic lives in `logic/family-core.js` with a case in `logic/family-core.test.cjs`.
   Eggs and streaks are derived from records, never stored (huevos R4).
5. **The contract is `CONTRACT.md`; the words are `GLOSSARY.md`.** One cast (`shell-base`), one state (`WB.state`), one
   permission check (`WB.can`).
6. **Generated files** (`screens.json`, `generated/`) come from `node tools/build-screens.mjs`; never hand-edit.
7. **Copy** on screens is Mexican Spanish and short (buttons 2–4 words, notices ≤ 8 words); it follows the product's
   tone: praise what the kid did, never threaten a streak, no red zeros (rachas R10, R13). Data is fictional.
8. **Tests:** Playwright, headless only, Chromium and WebKit as iPhone 15 (`tests/`); the rules in Node
   (`node --test logic/family-core.test.cjs`). Builds and `node_modules` live under `~/.cache/claude-builds/cs-simulator/`,
   never in the repo (`tests/node_modules` is a link, ignored). Comments live in
   `~/.cache/claude-builds/cs-simulator/comments/`.
9. **No outside changes:** no deploys, no pushes, no hosting. Commit only when told (`CLAUDE.md` at the repo root).

## Before you call work done

1. `node tools/check-flows.mjs` — in step; `--stamp` the flow docs you touched.
2. `pnpm check` at the repo root (it runs `check`: build-screens `--check`, check-flows, the rules' test).
3. The specs you touched, headless (`cd tests && npx playwright test <spec>`), and a walk of the change as the role it
   is for.

## Comments

People review by commenting («Comentar», tap anything, write) and follow each comment in «Mis comentarios». The AI of
the machine that runs the simulator listens with the skill `.claude/skills/listen-comments/SKILL.md` and answers each
one: `visto`, then `en arreglo`, `necesita decisión` or `no se hará`, and `hecho` when the fix is in.
