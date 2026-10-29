#!/usr/bin/env node
// Reopens the exact moment of a comment, headless, and saves a screenshot — so the AI that listens reproduces it in one
// step (inspiration idea 1). Called by `sim-comments.py replay <id>`; it can be run alone with a comment row as JSON:
//
//   node simulator/tools/replay.mjs '<comment row as JSON>' [--out shot.png] [--base http://127.0.0.1:4710]
//
// The moment: the scenario, the «¿Qué pasa si…?» situation, the session, «Ver como» (person and context), the clock's offset,
// the screen with its params and state, the device and viewport. Without --base it starts its own «like production» server
// with a throw-away comments folder. Prints one JSON line: { screen, state, reached, shot }. Playwright comes from
// simulator/tests/node_modules (tools/setup-tests.sh). Headless only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const SIM = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const c = JSON.parse(args[0] || '{}');
if (!c.id || !c.screen) { console.error('replay: give a comment row as JSON (id, screen, …)'); process.exit(2); }
const OUTDIR = path.join(os.homedir(), '.cache', 'claude-builds', 'cs-simulator', 'replays');
fs.mkdirSync(OUTDIR, { recursive: true });
const out = path.resolve(opt('--out') || path.join(OUTDIR, c.id + '.png'));

// Playwright: this worktree's tests, else WB_PLAYWRIGHT_DIR, else any lane's install under ~/.cache/claude-builds/cs-simulator/
let pw;
const BUILDS = path.join(os.homedir(), '.cache', 'claude-builds', 'cs-simulator');
const homes = [path.join(SIM, 'tests'), process.env.WB_PLAYWRIGHT_DIR].filter(Boolean)
  .concat(fs.existsSync(BUILDS) ? fs.readdirSync(BUILDS).map((d) => path.join(BUILDS, d)) : []);
for (const h of homes) { try { pw = createRequire(path.join(h, 'package.json'))('playwright'); break; } catch {} }
if (!pw) { console.error('replay: Playwright is not installed here — run simulator/tools/setup-tests.sh <lane> once (it installs under ~/.cache/claude-builds/cs-simulator/<lane>/), or set WB_PLAYWRIGHT_DIR'); process.exit(2); }

// --base: the host (http://127.0.0.1:4710), with or without /simulator/ after it
let base = opt('--base') ? opt('--base').replace(/\/simulator(\/.*)?$/, '').replace(/\/+$/, '') : undefined, srv = null;
if (!base) {
  const { start } = await import(path.join(SIM, 'tools', 'serve.mjs'));
  srv = await start(0, { commentsDir: path.join(OUTDIR, 'comments') });
  base = 'http://127.0.0.1:' + srv.address().port;
}
const rt = c.runtime || {}, session = rt.session || {};
const [dev, turn] = String(c.device || '').split('-');
const device = ['iphone15', 'android', 'ipad', 'tablet'].includes(dev) ? dev : 'iphone15', landscape = turn === 'landscape';
const browser = await pw.chromium.launch();
let result;
try {
  const page = await (await browser.newContext({ viewport: { width: c.vp_w || 1440, height: c.vp_h || 900 }, deviceScaleFactor: Math.min(2, c.dpr || 1) })).newPage();
  await page.addInitScript(([d, l]) => { try { localStorage.setItem('wb-shell/v1', JSON.stringify({ welcomeSeen: true, device: d, landscape: l })); } catch (e) {} }, [device, landscape]);
  await page.goto(base + '/simulator/');
  const up = await page.waitForFunction(() => window.WBShell && window.WB && WB.index, null, { timeout: 20000 }).then(() => true, () => false);
  if (!up) { console.error('replay: no simulator answered at ' + base + '/simulator/ — is the server running there?'); process.exit(2); }
  await page.evaluate((m) => {
    if (m.scenario && WB.index.scenarios[m.scenario]) WB.reset(m.scenario);
    if (m.situation && (WB.index.situations || []).some((s) => s.id === m.situation)) WBShell._.applySituation(m.situation);
    if (m.signedIn) WB.session.signIn(m.person || null, { pin: true });
    if (m.person && WB.state.get('people', m.person)) WB.viewAs.set(m.person, m.context || undefined);
    if (m.offset >= 60000) WB.clock.advance(m.offset);
    WBShell.open(m.screen, m.params || {}, m.state && m.state !== 'default' ? { state: m.state } : {});
  }, { scenario: c.scenario, situation: c.situation, signedIn: !!session.signed_in, person: c.view_as_person || session.person, context: c.view_as_context,
    offset: c.clock_offset_ms || 0, screen: c.screen, params: c.params || (rt.view && rt.view.params) || {}, state: c.state });
  const reached = await page.waitForFunction((m) => { const h = WBShell._.here(); return h.screen === m.screen && (!m.state || m.state === 'default' || h.state === m.state); },
    { screen: c.screen, state: c.state }, { timeout: 20000 }).then(() => true, () => false);
  await page.waitForTimeout(900);
  await page.screenshot({ path: out });
  const h = await page.evaluate(() => WBShell._.here());
  result = { id: c.id, screen: h.screen, state: h.state, reached, shot: out };
} finally { await browser.close(); if (srv) srv.close(); }
console.log(JSON.stringify(result));
process.exit(result.reached ? 0 : 1);
