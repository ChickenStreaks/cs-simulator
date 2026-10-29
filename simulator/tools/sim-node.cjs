// Runs simulator/sim.js and the lane logic in Node, inside a vm sandbox that stands in for the few browser objects
// they touch, so a tool or a test reads the same world the screens read: seeding, relative times, «¿Qué pasa si…?»
// patches and balances all come from sim.js itself — never from a second copy of its rules.
//
//   const { open } = require('./sim-node.cjs');
//   const sim = await open({ now: '2026-10-27T18:00:00Z' });   // the simulated «now» every relative time hangs from
//   sim.load('shell-base');                                     // WB.reset(id), as «Empezar de nuevo» does
//   sim.situation('family-auto-approve');                       // as the shell's «¿Qué pasa si…?» applies it
//   sim.CSCore.streak(sim.WB.state.get(), 'p-sofia', sim.WB.clock.day());
//
// It needs the generated index (node simulator/tools/build-screens.mjs). No DOM: screens are not wired here.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SIM = path.resolve(__dirname, '..');

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
  };
}

function element() {
  const noop = () => {};
  return { setAttribute: noop, getAttribute: () => null, removeAttribute: noop, appendChild: noop, style: {}, dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false } };
}

async function open(opts = {}) {
  const now = opts.now == null ? Date.parse('2026-10-27T18:00:00Z') : typeof opts.now === 'number' ? opts.now : Date.parse(opts.now);
  if (!Number.isFinite(now)) throw new Error('sim-node: bad «now» ' + opts.now);
  const noop = () => {};
  const document = {
    currentScript: null, readyState: 'complete',
    write() { throw new Error('sim-node: document.write is not available in Node'); },
    createElement: element, head: element(), body: element(), documentElement: element(),
    addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
  };
  const window = {
    document, location: new URL('http://127.0.0.1/simulator/'),
    localStorage: memoryStorage(), sessionStorage: memoryStorage(),
    addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop }),
    history: { back: noop }, navigator: { userAgent: 'node' },
    setTimeout, clearTimeout, console, URL, URLSearchParams,
  };
  window.window = window; window.self = window; window.parent = window; window.top = window;
  const ctx = vm.createContext(window);
  vm.runInContext('Date.now = function () { return ' + now + '; };', ctx);   // seeding hangs every relative time from here

  const run = (rel) => vm.runInContext(fs.readFileSync(path.join(SIM, rel), 'utf8'), ctx, { filename: rel });
  run('generated/index.js');
  const index = window.WB_INDEX;
  if (!index) throw new Error('sim-node: simulator/generated/index.js did not set WB_INDEX');
  // sim.js boots on a microtask after an (empty here) logic chain; the lane logic runs first, synchronously, as the
  // browser's parser-inserted scripts would.
  window.WB_INDEX = Object.assign({}, index, { logic: [] });
  run('sim.js');
  window.WB_INDEX = index;
  for (const f of index.logic) run(path.relative(SIM, path.join(SIM, '..', f)));
  await new Promise((r) => setImmediate(r));
  const WB = window.WB;
  if (!WB || !WB.state) throw new Error('sim-node: sim.js did not define WB');

  return {
    WB, CSCore: window.CSCore, window, index,
    scenarios: () => Object.keys(index.scenarios),
    situations: () => (index.situations || []).slice(),
    load(id) { WB.reset(id); return WB; },
    situation(id) {
      const s = (index.situations || []).find((x) => x.id === id);
      if (!s) throw new Error('sim-node: unknown situation ' + id);
      if (s.scenario && s.scenario !== WB.scenario.current()) WB.reset(s.scenario);
      if (s.patch && s.patch.length) WB.state.patch(s.patch, null);
      if (s.viewAs) WB.viewAs.set(s.viewAs.person, s.viewAs.context);
      if (s.advance) WB.clock.advance(s.advance);
      return WB;
    },
    // a value from the sandbox as plain JSON, as it would arrive over HTTP
    json: (v) => JSON.parse(JSON.stringify(v)),
  };
}

module.exports = { open, SIM };
