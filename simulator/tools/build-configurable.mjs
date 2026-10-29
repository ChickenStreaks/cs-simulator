#!/usr/bin/env node
// «Ver lo configurable» and «Ver lo por decidir»: the lists, from ONE source each.
//   - configurable settings: the «## Configurable settings» table of every simulator/flows/*.md (columns Id | Setting |
//     Default | Limits | Changed by | Rule …); a setting's key is «<flow file>/<Id>», e.g. «access/biometrics»;
//   - markers in the simulator's code: WB.configurable(el, { key: 'access/biometrics', … }) or data-wb-configurable="…",
//     WB.undecided(el, { question: '¿…?', ref: '…' }) or data-wb-undecided="…", and catalog entries' «undecided» notes;
//   - each flow's «## Open questions» list, and every catalog screen whose design is «draft» (Addition 3).
// Fails (exit 1) when a marker names a setting no flow lists. Writes simulator/generated/markers.json.
// Usage: node simulator/tools/build-configurable.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SIM = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT = path.resolve(SIM, '..');
const OUT = path.join(SIM, 'generated', 'markers.json');

function walk(dir, ok) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return /^(node_modules|generated|tests|tools|server|vendor)$/.test(e.name) ? [] : walk(p, ok);
    return ok(p) ? [p] : [];
  });
}
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

// a markdown table under a heading → rows of {header: cell}
function tableAfter(text, headingRe) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^#{2,4} /.test(l) && headingRe.test(l));
  if (start < 0) return [];
  const rows = [];
  let head = null;
  for (let i = start + 1; i < lines.length && !/^#{1,4} /.test(lines[i]); i++) {
    const l = lines[i].trim();
    if (!l.startsWith('|')) { if (head && rows.length) break; continue; }
    const cells = l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (!head) { head = cells.map((c) => c.toLowerCase()); continue; }
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    const row = {}; head.forEach((h, k) => { row[h] = (cells[k] || '').replace(/^`|`$/g, ''); });
    rows.push(row);
  }
  return rows;
}

export function settings() {
  const out = {};
  for (const f of walk(path.join(SIM, 'flows'), (p) => p.endsWith('.md'))) {
    const flow = path.basename(f, '.md'), text = fs.readFileSync(f, 'utf8');
    for (const r of tableAfter(text, /configurable/i)) {
      const name = (r.setting || r.name || '').replace(/[«»*`]/g, '');
      // the Id column (CONTRACT §10); without one, the setting's name as a slug
      const id = r.id || r.key || r.clave || name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
      if (!id) continue;
      out[flow + '/' + id] = { flow: rel(f), id, name, default: r.default || '', limits: r.limits || '', by: r['changed by'] || r['set by'] || r['who and where'] || '', rule: r.rule || '' };
    }
  }
  return out;
}

export function openQuestions() {
  const out = [];
  for (const f of walk(path.join(SIM, 'flows'), (p) => p.endsWith('.md'))) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    const start = lines.findIndex((l) => /^#{2,4} .*open questions/i.test(l));
    if (start < 0) continue;
    let cur = null;
    for (let i = start + 1; i < lines.length && !/^#{1,4} /.test(lines[i]); i++) {
      const m = /^(?:[-*]|\d+\.)\s+(.+)$/.exec(lines[i]);
      if (m) { cur = { flow: rel(f), text: m[1].trim() }; out.push(cur); }
      else if (cur && /^\s+\S/.test(lines[i])) cur.text += ' ' + lines[i].trim();   // a wrapped line of the same item
      else if (!lines[i].trim()) cur = null;
    }
  }
  return out;
}

// the founder's provisional decisions (DECISIONS.md «Provisional» table: | **F1** | decision | why | where |; a principal-pocket
// question taken as provisional keeps its P-n, e.g. P3), so «Ver lo
// por decidir» lists all of them, whether a screen marks them yet or not
export function provisionalDecisions() {
  const f = path.join(SIM, 'DECISIONS.md'), plain = (s) => s.replace(/\*\*|`/g, '').trim();
  if (!fs.existsSync(f)) return [];
  return [...fs.readFileSync(f, 'utf8').matchAll(/^\|\s*\*\*([FP]\d+)\*\*\s*\|([^|]+)\|([^|]+)\|([^|]+)\|\s*$/gm)]
    .map((m) => ({ id: m[1], decision: plain(m[2]), why: plain(m[3]), where: plain(m[4]) }));
}

// string value of a key inside an object literal: key: '…' | "…" | `…`
function prop(src, key) { const m = new RegExp(key + "\\s*:\\s*(['\"`])((?:\\\\.|(?!\\1).)*)\\1").exec(src); return m ? m[2].replace(/\\(.)/g, '$1') : null; }
function attr(tag, name) { const m = new RegExp(name + '="([^"]*)"').exec(tag); return m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : null; }

export function markers(catalogScreens) {
  const configurable = [], undecided = [], provisional = [];
  const files = walk(path.join(SIM, 'screens'), (p) => /\.(html|js)$/.test(p)).concat(walk(path.join(SIM, 'logic'), (p) => p.endsWith('.js')));
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/WB\.configurable\([^{]*\{([^}]*)\}/g)) configurable.push({ key: prop(m[1], 'key'), label: prop(m[1], 'label'), default: prop(m[1], 'default'), file: rel(f) });
    for (const m of src.matchAll(/<[^>]*\bdata-wb-configurable="[^"]*"[^>]*>/g)) configurable.push({ key: attr(m[0], 'data-wb-configurable'), label: attr(m[0], 'data-wb-label'), default: attr(m[0], 'data-wb-default'), file: rel(f) });
    for (const m of src.matchAll(/WB\.undecided\([^{]*\{([^}]*)\}/g)) undecided.push({ question: prop(m[1], 'question'), ref: prop(m[1], 'ref'), file: rel(f) });
    for (const m of src.matchAll(/<[^>]*\bdata-wb-undecided="[^"]*"[^>]*>/g)) undecided.push({ question: attr(m[0], 'data-wb-undecided'), ref: attr(m[0], 'data-wb-ref'), file: rel(f) });
    for (const m of src.matchAll(/WB\.provisional\([^{]*\{([^}]*)\}/g)) provisional.push({ decision: prop(m[1], 'decision'), ref: prop(m[1], 'ref'), file: rel(f) });
    for (const m of src.matchAll(/<[^>]*\bdata-wb-provisional="[^"]*"[^>]*>/g)) provisional.push({ decision: attr(m[0], 'data-wb-provisional'), ref: attr(m[0], 'data-wb-ref'), file: rel(f) });
  }
  for (const s of Object.values(catalogScreens || {})) for (const u of s.undecided || []) undecided.push({ question: u.question, ref: u.ref || null, screen: s.id, file: s.catalogFile });
  return { configurable: configurable.filter((c) => c.key), undecided: undecided.filter((u) => u.question), provisional: provisional.filter((p) => p.decision) };
}

export function build(catalogScreens) {
  const S = settings(), M = markers(catalogScreens), bad = [];
  for (const c of M.configurable) if (!S[c.key]) bad.push(`${c.file}: WB.configurable key «${c.key}» is not a setting of any simulator/flows/*.md («## Configurable settings» table, key «<flow>/<Id>»)`);
  const marked = new Set(M.configurable.map((c) => c.key));
  const unmarked = Object.keys(S).filter((k) => !marked.has(k));
  const drafts = Object.values(catalogScreens || {}).filter((s) => s.design === 'draft' && !s.hidden).map((s) => ({ screen: s.id, title: s.title, owner: s.owner }));
  return { bad, data: { settings: S, configurable: M.configurable, undecided: M.undecided, provisional: M.provisional, decisions: provisionalDecisions(), openQuestions: openQuestions(), drafts, unmarked } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { loadCatalog } = await import('./build-screens.mjs');
  const { screens } = loadCatalog();
  const { bad, data } = build(screens);
  if (bad.length) { console.error('build-configurable: ' + bad.length + ' problem(s)\n  ' + bad.join('\n  ')); process.exit(1); }
  const text = JSON.stringify(data, null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (cur !== text) { console.error('build-configurable: simulator/generated/markers.json is out of date (run node simulator/tools/build-configurable.mjs)'); process.exit(1); }
  } else { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, text); }
  console.log(`build-configurable: ${Object.keys(data.settings).length} settings · ${data.configurable.length} configurable markers · ${data.undecided.length} undecided · ${data.openQuestions.length} open questions · ${data.drafts.length} draft screens` + (data.unmarked.length ? ` · not shown anywhere yet: ${data.unmarked.join(', ')}` : ''));
}
