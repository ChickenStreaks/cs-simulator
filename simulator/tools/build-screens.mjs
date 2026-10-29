#!/usr/bin/env node
// Merges every lane's fragments into the simulator's generated index (never hand-edit the outputs):
//   simulator/catalog/*.json    → simulator/screens.json            (screen id → file, area, states: what the comments server checks)
//   + simulator/scenarios/*.json, simulator/stories/*.json, simulator/logic/*.js, the markers (build-configurable.mjs)
//                               → simulator/generated/index.js      (window.WB_INDEX, loaded by sim.js in every page)
// Checks: unique screen ids (a «provisional» entry gives way to its owner's), files that exist, areas, design, states,
// scenarios that seed (extends, people, chores, marks, prizes), situations and stories that point at known screens.
// Usage: node simulator/tools/build-screens.mjs [--check] [--render]
//   --check   exit 1 when screens.json or generated/index.js is out of date (nothing written)
//   --render  also open every state of every screen in Chromium and fail on a page error or a blank page
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as buildMarkers } from './build-configurable.mjs';

export const SIM = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT = path.resolve(SIM, '..');
const AREAS = ['app', 'dev'];   // no business web here: ChickenStreaks is a phone app
const DESIGN = ['draft', 'designer'];
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const json = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { throw new Error(rel(f) + ': ' + e.message); } };
const list = (dir, ext) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(ext) && !f.startsWith('_')).sort().map((f) => path.join(dir, f)) : []);

export function loadCatalog() {
  const bad = [], screens = {};
  for (const f of list(path.join(SIM, 'catalog'), '.json')) {
    const frag = json(f), lane = frag.lane || path.basename(f, '.json');
    for (const s0 of frag.screens || []) {
      const s = Object.assign({ owner: lane, lane, design: 'draft', aliases: [], states: [] }, s0, { catalogFile: rel(f) });
      const at = `${rel(f)} ${s.id}`;
      if (!/^(app|dev)\.[a-z0-9.-]+$/.test(s.id || '')) { bad.push(`${at}: id must look like app.<name> or dev.<name>`); continue; }
      if (!AREAS.includes(s.area)) bad.push(`${at}: area must be app or dev`);
      if (!DESIGN.includes(s.design)) bad.push(`${at}: design must be «draft» or «designer» (Addition 3)`);
      if (!s.file || !fs.existsSync(path.join(ROOT, s.file))) bad.push(`${at}: file ${s.file} does not exist`);
      if (!s.title) bad.push(`${at}: needs a title`);
      if (!Array.isArray(s.states) || !s.states.length) bad.push(`${at}: needs at least one state`);
      const ids = new Set();
      for (const st of s.states || []) { if (!st.id) bad.push(`${at}: a state without id`); if (ids.has(st.id)) bad.push(`${at}: state ${st.id} twice`); ids.add(st.id); }
      const prev = screens[s.id];
      if (prev) {
        if (prev.provisional && !s.provisional) { s.aliases = [...new Set([...(s.aliases || []), ...(prev.aliases || [])])]; screens[s.id] = s; }
        else if (s.provisional && !prev.provisional) prev.aliases = [...new Set([...(prev.aliases || []), ...(s.aliases || [])])];
        else bad.push(`${at}: screen id also in ${prev.catalogFile}`);
        continue;
      }
      screens[s.id] = s;
    }
  }
  return { screens, bad };
}

const COLS = ['people', 'chores', 'marks', 'prizes', 'redemptions', 'forgives', 'pauses', 'lovis', 'goals'];
export function loadScenarios(screens) {
  const bad = [], scenarios = {}, situations = [];
  for (const f of list(path.join(SIM, 'scenarios'), '.json')) {
    const sc = json(f), id = path.basename(f, '.json');
    if (sc.id && sc.id !== id) bad.push(`${rel(f)}: id «${sc.id}» must be the file name «${id}»`);
    const lane = id.split('-')[0] === 'flow' ? id.split('-').slice(0, 2).join('-') : id.split('-')[0];
    scenarios[id] = Object.assign({}, sc, { id, lane, file: rel(f) });
    for (const s of sc.situations || []) situations.push(Object.assign({ scenario: id, lane }, s, { file: rel(f) }));
  }
  // resolve each scenario as sim.js will, and check its references
  const resolve = (id, seen = []) => {
    if (!scenarios[id]) throw new Error(`unknown scenario «${id}»`);
    if (seen.includes(id)) throw new Error('extends loop ' + [...seen, id].join(' → '));
    const sc = scenarios[id], base = sc.extends ? resolve(sc.extends, [...seen, id]) : {};
    const out = {};
    for (const c of COLS) {
      const l = [...(base[c] || [])];
      for (const it of (sc.data || {})[c] || []) { const i = l.findIndex((x) => x.id === it.id); if (it._delete) { if (i >= 0) l.splice(i, 1); } else if (i >= 0) l[i] = it; else l.push(it); }
      out[c] = l;
    }
    return out;
  };
  for (const id of Object.keys(scenarios)) {
    let w; try { w = resolve(id); } catch (e) { bad.push(`${scenarios[id].file}: ${e.message}`); continue; }
    const has = (c, x) => w[c].some((i) => i.id === x);
    const at = scenarios[id].file;
    for (const c of COLS) { const seen = new Set(); for (const it of w[c]) { if (!it.id) bad.push(`${at}: an item of ${c} without id`); if (seen.has(it.id)) bad.push(`${at}: ${c} id ${it.id} twice`); seen.add(it.id); } }
    const person = (x, role) => w.people.some((p) => p.id === x && (!role || p.role === role));
    for (const p of w.people) {
      if (!['adult', 'kid'].includes(p.role)) bad.push(`${at}: person ${p.id} role must be adult or kid`);
      if (p.role === 'kid' && !['4-6', '7-9', '10-12', '13+'].includes(p.ageRange)) bad.push(`${at}: kid ${p.id} ageRange must be 4-6, 7-9, 10-12 or 13+ (familia R8)`);
      if (p.birthdate || p.photo) bad.push(`${at}: person ${p.id}: no birthdate or photo of a kid (familia R8)`);
    }
    if (w.people.filter((p) => p.role === 'adult' && !p.removedAt).length > 2) bad.push(`${at}: at most two adults (familia R2)`);
    for (const c of w.chores) {
      if (!Array.isArray(c.kids) || !c.kids.length || c.kids.some((k) => !person(k, 'kid'))) bad.push(`${at}: chore ${c.id} kids must be known kids`);
      if (!Array.isArray(c.days) || c.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) bad.push(`${at}: chore ${c.id} days must be weekdays 0..6`);
      if (!Number.isInteger(c.eggs) || c.eggs < 1 || c.eggs > 50) bad.push(`${at}: chore ${c.id} eggs must be a whole number 1..50 (huevos R2)`);
    }
    for (const m of w.marks) {
      if (!has('chores', m.chore)) bad.push(`${at}: mark ${m.id} chore ${m.chore} unknown`);
      if (!person(m.kid, 'kid')) bad.push(`${at}: mark ${m.id} kid ${m.kid} unknown`);
      if (!['pending', 'approved', 'redo'].includes(m.status)) bad.push(`${at}: mark ${m.id} status must be pending, approved or redo`);
      if (!m.day) bad.push(`${at}: mark ${m.id} needs its day`);
    }
    for (const p of w.prizes) { if (!person(p.kid, 'kid')) bad.push(`${at}: prize ${p.id} kid unknown`); if (!Number.isInteger(p.price) || p.price < 1) bad.push(`${at}: prize ${p.id} price must be a whole number of eggs`); }
    for (const r of w.redemptions) { if (!has('prizes', r.prize)) bad.push(`${at}: redemption ${r.id} prize unknown`); if (!['to-deliver', 'delivered'].includes(r.status)) bad.push(`${at}: redemption ${r.id} status must be to-deliver or delivered`); }
    for (const f of [...w.forgives, ...w.pauses, ...w.lovis]) if (!person(f.kid, 'kid')) bad.push(`${at}: ${f.id} kid ${f.kid} unknown`);
    const vs = scenarios[id].viewAs; if (vs && vs.person && !has('people', vs.person)) bad.push(`${at}: viewAs person ${vs.person} unknown`);
  }
  for (const s of situations) {
    if (!s.id || !s.title || !s.group) bad.push(`${s.file}: a situation needs id, group and title`);
    if (!scenarios[s.scenario]) bad.push(`${s.file}: situation ${s.id} scenario ${s.scenario} unknown`);
    if (s.open && s.open.screen && !screens[s.open.screen]) bad.push(`${s.file}: situation ${s.id} opens unknown screen ${s.open.screen}`);
  }
  const dup = situations.map((s) => s.id).filter((x, i, a) => a.indexOf(x) !== i);
  if (dup.length) bad.push('situation ids twice: ' + [...new Set(dup)].join(', '));
  return { scenarios, situations, bad };
}

export function loadStories(screens) {
  const bad = [], stories = [];
  for (const f of list(path.join(SIM, 'stories'), '.json')) {
    const frag = json(f), lane = frag.lane || path.basename(f, '.json');
    for (const st of frag.stories || []) {
      const at = `${rel(f)} ${st.id}`;
      // a mission (inspiration idea 7, CONTRACT §5): no coach, a goal the world must reach, an optional question at the end
      if (st.coach === false) {
        if (!st.id || !st.title) { bad.push(`${at}: a mission needs id and title`); continue; }
        if (!st.start || !screens[st.start.screen]) bad.push(`${at}: a mission needs start.screen, a known screen`);
        const g = st.goal || {}, kinds = ['screen', 'record'].filter((k) => g[k]);
        if (!kinds.length) bad.push(`${at}: a mission needs a goal: screen and/or record`);
        if (g.screen && !screens[g.screen]) bad.push(`${at}: goal.screen ${g.screen} is not a screen`);
        if (g.record && !g.record.col) bad.push(`${at}: goal.record needs col`);
        if (st.question && (!st.question.text || !Array.isArray(st.question.options) || st.question.options.length < 2)) bad.push(`${at}: question needs text and two options or more`);
        stories.push(Object.assign({ lane }, st, { steps: [], file: rel(f) }));
        continue;
      }
      if (!st.id || !st.title || !Array.isArray(st.steps) || !st.steps.length) { bad.push(`${at}: a story needs id, title and steps`); continue; }
      st.steps.forEach((p, i) => {
        if (!p.screen || !screens[p.screen]) bad.push(`${at} step ${i + 1}: unknown screen ${p.screen}`);
        if (!['read', 'tap', 'wait', 'input'].includes(p.kind || 'read')) bad.push(`${at} step ${i + 1}: kind must be read, tap, wait or input`);
        if (!p.text) bad.push(`${at} step ${i + 1}: needs text`);
        if ((p.text || '').split(/\s+/).length + (p.sub || '').split(/\s+/).length > 26) bad.push(`${at} step ${i + 1}: over 20 words`);
      });
      stories.push(Object.assign({ lane }, st, { file: rel(f) }));
    }
  }
  return { stories, bad };
}

export function logicFiles() {
  return list(path.join(SIM, 'logic'), '.js').map(rel).sort((a, b) => (a.endsWith('/shell.js') ? -1 : b.endsWith('/shell.js') ? 1 : a.localeCompare(b)));
}

export function generate() {
  const { screens, bad: b1 } = loadCatalog();
  const { scenarios, situations, bad: b2 } = loadScenarios(screens);
  const { stories, bad: b3 } = loadStories(screens);
  const { bad: b4, data: markers } = buildMarkers(screens);
  const bad = [...b1, ...b2, ...b3, ...b4];
  if (!scenarios['shell-base']) bad.push('simulator/scenarios/shell-base.json is missing (the default scenario)');
  const pub = {};
  for (const [id, s] of Object.entries(screens).sort()) {
    pub[id] = { id, title: s.title, area: s.area, file: s.file, aliases: s.aliases || [], design: s.design, owner: s.owner, provisional: !!s.provisional, hidden: !!s.hidden,
      pilot: s.pilot !== false, flow: s.flow || null, spec: s.spec || null, states: s.states, undecided: s.undecided || [], timers: s.timers || null };
  }
  const screensJson = {};
  for (const [id, s] of Object.entries(pub)) screensJson[id] = { file: s.file, area: s.area, title: s.title, design: s.design, owner: s.owner, aliases: s.aliases, states: s.states.map((x) => x.id) };
  const index = { contract: '1', defaultScenario: 'shell-base', screens: pub, scenarios, situations, stories, logic: logicFiles(), markers };
  return {
    bad,
    files: {
      [path.join(SIM, 'screens.json')]: JSON.stringify(screensJson, null, 1) + '\n',
      [path.join(SIM, 'generated', 'index.js')]: '/* GENERATED by simulator/tools/build-screens.mjs from simulator/catalog, scenarios, stories, logic and the markers — never edit by hand. */\nwindow.WB_INDEX = ' + JSON.stringify(index) + ';\n',
      [path.join(SIM, 'generated', 'markers.json')]: JSON.stringify(markers, null, 1) + '\n'
    },
    stats: { screens: Object.keys(pub).length, states: Object.values(pub).reduce((n, s) => n + s.states.length, 0), scenarios: Object.keys(scenarios).length, situations: situations.length, stories: stories.length, logic: index.logic.length }
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const g = generate();
  if (g.bad.length) { console.error('build-screens: ' + g.bad.length + ' problem(s)\n  ' + g.bad.join('\n  ')); process.exit(1); }
  const stale = Object.entries(g.files).filter(([f, t]) => !fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== t).map(([f]) => rel(f));
  if (process.argv.includes('--check')) {
    if (stale.length) { console.error('build-screens: out of date: ' + stale.join(', ') + ' (run node simulator/tools/build-screens.mjs)'); process.exit(1); }
  } else for (const [f, t] of Object.entries(g.files)) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); }
  const s = g.stats;
  console.log(`build-screens: ${s.screens} screens · ${s.states} states · ${s.scenarios} scenarios · ${s.situations} situations · ${s.stories} stories · ${s.logic} logic files` + (process.argv.includes('--check') ? ' · up to date' : ''));
  if (process.argv.includes('--render')) {
    const { renderAll } = await import('./render-states.mjs');
    process.exit(await renderAll());
  }
}
