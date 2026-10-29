#!/usr/bin/env node
// The written flows stay in step with the simulator (rule 1 of simulator/AGENTS.md). Two checks:
//
//   structure — every catalog screen id is named in at least one flow doc (dev.* excepted); every screen id a flow names
//               exists in the catalog; every flow has its header: id, actor, trigger, status and «last checked
//               against the simulator: <commit>» (also read as last_checked).
//   sync      — against a base (default dev): every file changed under screens/, logic/, scenarios/ or stories/ maps
//               to the flows that name its screen ids, and at least one of those flow docs changed too; a flow doc that
//               changed names a new commit in that line. Changes not committed yet count.
//
//   node simulator/tools/check-flows.mjs                     # structure + sync against main
//   node simulator/tools/check-flows.mjs --base main         # another base
//   node simulator/tools/check-flows.mjs --structure         # structure only (no git)
//   node simulator/tools/check-flows.mjs --allow "<reason>"  # a pure refactor: passes, and the commit message must
//                                                            # carry «Flows unchanged: <reason>» (later runs read it there)
//   node simulator/tools/check-flows.mjs --stamp             # the line names HEAD in every flow doc changed since the base
//   node simulator/tools/check-flows.mjs --root <dir>        # another simulator folder (the tests use a fixture repo)
//
// Exit 0 in step · 1 out of step (each problem listed) · 2 the check itself could not run (bad option, unknown base).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HEADER = ['id', 'actor', 'trigger', 'status', 'last_checked'];
const LAST = 'last checked against the simulator';   // how a flow header names it (Wirebit's words, kept); last_checked also reads
const LAST_RE = /^(last checked against the simulator|last_checked):.*$/im;
const WATCHED = ['screens/', 'logic/', 'scenarios/', 'stories/'];
const MARKER = /^Flows unchanged:\s*\S.{4,}$/m;   // the commit message line an --allow reason becomes
const ID = /\b(?:app|dev)\.[a-z0-9-]+(?:\.[a-z0-9-]+)*/g;
const WIRE = /(?:WB\.wire|stepsScreen)\(\s*['"]((?:app|dev)\.[a-z0-9.-]+)['"]/g;

function args(argv) {
  const o = { base: 'dev',   // ponytail: this repo works on dev; pass --base main once a main branch exists
              structureOnly: false, allow: null, stamp: false, root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => { if (i + 1 >= argv.length) throw new Usage(a + ' needs a value'); return argv[++i]; };
    if (a === '--base') o.base = next();
    else if (a === '--structure') o.structureOnly = true;
    else if (a === '--allow') { o.allow = next().trim(); if (o.allow.length < 5) throw new Usage('--allow needs a real reason (it goes in the commit message)'); }
    else if (a === '--stamp') o.stamp = true;
    else if (a === '--root') o.root = path.resolve(next());
    else if (a === '-h' || a === '--help') throw new Usage(null);
    else throw new Usage('unknown option ' + a);
  }
  return o;
}
class Usage extends Error {}

/* ---------- the simulator as files ---------- */
function catalog(root, top) {
  const screens = {};
  for (const f of fs.readdirSync(path.join(root, 'catalog')).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort()) {
    const frag = JSON.parse(fs.readFileSync(path.join(root, 'catalog', f), 'utf8')), lane = frag.lane || path.basename(f, '.json');
    for (const s of frag.screens || []) {
      if (!s.id || (screens[s.id] && !screens[s.id].provisional)) continue;
      if (s.provisional && screens[s.id]) continue;
      screens[s.id] = { id: s.id, lane: s.owner || lane, provisional: !!s.provisional, states: (s.states || []).map((x) => x.id),
        file: s.file ? path.relative(root, path.join(top, s.file)).split(path.sep).join('/') : null };
    }
  }
  return screens;
}
function frontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (!m) return null;
  const o = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w -]*?):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1].toLowerCase().replace(/\s+/g, ' ') === LAST ? 'last_checked' : kv[1];
    o[key] = kv[2].replace(/\s+#.*$/, '').replace(/^"(.*)"$/, '$1').trim();
  }
  return o;
}
// the catalog ids a text names: «app.pin», «app.pin.html», «app.signup.listo» (screen + state) all name a screen
function named(text, screens) {
  const known = new Set(), unknown = new Set();
  for (const raw of text.match(ID) || []) {
    let id = raw.replace(/\.(html|md|js|json|css)$/, '');
    if (screens[id]) { known.add(id); continue; }
    const cut = id.lastIndexOf('.'), head = id.slice(0, cut), tail = id.slice(cut + 1);
    if (cut > 0 && screens[head] && screens[head].states.includes(tail)) known.add(head); else unknown.add(id);
  }
  return { known, unknown };
}
function flowDocs(root) {
  const dir = path.join(root, 'flows');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort().map((f) => {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    return { file: 'flows/' + f, text, header: frontMatter(text) };
  });
}

/* ---------- structure ---------- */
function structure(root, screens, flows) {
  const out = [], namedBy = {};
  for (const fl of flows) {
    if (!fl.header) out.push(`${fl.file}: no header — start the file with a «---» block holding ${HEADER.join(', ')}`);
    else for (const k of HEADER) if (!fl.header[k]) out.push(`${fl.file}: header has no «${k === 'last_checked' ? LAST + ': <commit>' : k}»` + (k === 'last_checked' ? ' (--stamp writes it)' : ''));
    const { known, unknown } = named(fl.text, screens);
    for (const id of unknown) out.push(`${fl.file}: names ${id}, which is not in the catalog`);
    for (const id of known) (namedBy[id] = namedBy[id] || []).push(fl.file);
  }
  for (const id of Object.keys(screens).sort()) if (!id.startsWith('dev.') && !namedBy[id]) out.push(`${id} (${screens[id].lane}): no flow doc names it — describe it in the flow it belongs to`);
  return { problems: out, namedBy };
}

/* ---------- sync ---------- */
const git = (root, a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);

function changes(root, base) {
  try { git(root, ['rev-parse', '--verify', '--quiet', base + '^{commit}']); } catch { throw new Usage(`base ${base} not found here — pass --base <ref>`); }
  const mb = git(root, ['merge-base', base, 'HEAD']).trim();
  const changed = new Set([...lines(git(root, ['diff', '--name-only', '--relative', mb, '--', '.'])), ...lines(git(root, ['ls-files', '--others', '--exclude-standard']))]);
  const dirty = new Set([...lines(git(root, ['diff', '--name-only', '--relative', 'HEAD', '--', '.'])), ...lines(git(root, ['ls-files', '--others', '--exclude-standard']))]);
  // files every touching commit since the base excuses with «Flows unchanged: <reason>»
  const touched = {};
  for (const rec of git(root, ['log', '--no-merges', '--relative', '--name-only', '--format=%x1e%H%x1f%B%x1f', mb + '..HEAD', '--', '.']).split('\x1e').slice(1)) {
    const [, body, files] = rec.split('\x1f');
    for (const f of lines(files || '')) (touched[f] = touched[f] || []).push(MARKER.test(body));
  }
  const excused = new Set(Object.keys(touched).filter((f) => touched[f].every(Boolean) && !dirty.has(f)));
  return { mb, changed, excused };
}
// the screen ids a changed file is about
function idsOf(root, file, screens, mb) {
  const all = Object.values(screens);
  if (file.startsWith('screens/')) {
    const stem = file.replace(/\.(html|md)$/, '');
    const own = all.filter((s) => s.file && s.file.replace(/\.html$/, '') === stem).map((s) => s.id);
    if (own.length) return own;
    const meta = /<meta\s+name="wb-screen"\s+content="([^"]+)"/.exec(fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), 'utf8') : '');
    if (meta) return [meta[1]];   // a page that names itself (screens/missing.html is dev.missing)
    // a shared piece (a stylesheet, a partial, the business frame): the screens that load it
    const parts = file.split('/'), key = parts.find((p) => p.startsWith('_')) || path.basename(file);
    return all.filter((s) => s.file && fs.existsSync(path.join(root, s.file)) && fs.readFileSync(path.join(root, s.file), 'utf8').includes(key)).map((s) => s.id);
  }
  // logic: the screen each changed hunk sits in (its WB.wire), else the ids its lines name; scenarios, stories: the ids
  // in the changed lines
  const ids = new Set(), abs = path.join(root, file), now = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8').split('\n') : [];
  let inWire = false;
  let diff = '';
  try { diff = git(root, ['diff', '-U0', '--relative', mb, '--', file]); } catch {}
  if (!diff && now.length) diff = now.map((l) => '+' + l).join('\n');   // a new file: all of it
  for (const l of diff.split('\n')) {
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(l);
    if (h && file.startsWith('logic/')) {
      let wired = null;
      for (const pre of now.slice(0, Math.max(0, Number(h[1]))).join('\n').matchAll(WIRE)) wired = pre[1];
      inWire = !!(wired && screens[wired]);
      if (inWire) ids.add(wired);
    } else if (/^@@/.test(l)) inWire = false;
    else if (!inWire && /^[+-](?![+-]{2} )/.test(l)) for (const id of named(l, screens).known) ids.add(id);
  }
  if (ids.size) return [...ids];
  // nothing names a screen (a scenario's money, a helper): the screens of the lane the file belongs to
  const lane = Object.keys(all.reduce((o, s) => (o[s.lane] = 1, o), {})).sort((a, b) => b.length - a.length).find((l) => path.basename(file).startsWith(l));
  return lane ? all.filter((s) => s.lane === lane).map((s) => s.id) : [];
}
function sync(root, screens, flows, namedBy, base) {
  const { mb, changed, excused } = changes(root, base), out = [], excusedHit = [];
  const flowChanged = new Set(flows.map((f) => f.file).filter((f) => changed.has(f)));
  for (const file of [...changed].sort()) {
    if (!WATCHED.some((d) => file.startsWith(d))) continue;
    const all = idsOf(root, file, screens, mb), ids = all.filter((id) => !id.startsWith('dev.'));
    if (all.length && !ids.length) continue;   // a developer page (dev.*): no product flow describes it
    const docs = [...new Set(ids.flatMap((id) => namedBy[id] || []))].sort();
    if (docs.some((d) => flowChanged.has(d))) continue;
    if (excused.has(file)) { excusedHit.push(file); continue; }
    out.push(!ids.length ? `${file}: changed, and no screen id maps to it — write the flow that describes it (or --allow "<reason>")`
      : !docs.length ? `${file}: changed (${ids.join(', ')}), and no flow names those screens — the flow is missing: write it`
      : `${file}: changed (${ids.slice(0, 6).join(', ')}${ids.length > 6 ? '…' : ''}) but none of its flows changed: ${docs.join(', ')}`);
  }
  for (const f of flows) {
    if (!flowChanged.has(f.file)) continue;
    let before = null;
    try { before = frontMatter(git(root, ['show', mb + ':' + path.relative(git(root, ['rev-parse', '--show-toplevel']).trim(), path.join(root, f.file)).split(path.sep).join('/')])); } catch {}
    const now = f.header && f.header.last_checked;
    if (now && before && before.last_checked === now) out.push(`${f.file}: changed, but «${LAST}» still says ${now} — run with --stamp`);
    else if (now) { try { git(root, ['rev-parse', '--verify', '--quiet', now.split(/\s/)[0] + '^{commit}']); } catch { out.push(`${f.file}: «${LAST}» names ${now}, which is not a commit here`); } }
  }
  return { problems: out, mb, changed, excusedHit };
}

function stamp(root, flows, base) {
  const { changed } = changes(root, base), head = git(root, ['rev-parse', '--short', 'HEAD']).trim(), done = [];
  for (const f of flows) {
    if (!changed.has(f.file) || !f.header) continue;
    const abs = path.join(root, f.file), text = fs.readFileSync(abs, 'utf8');
    const fm = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(text)[0];
    const next = LAST_RE.test(fm) ? text.replace(fm, fm.replace(LAST_RE, (l, k) => k + ': ' + head)) : text.replace(fm, fm.replace(/(\r?\n---\r?\n)$/, '\n' + LAST + ': ' + head + '$1'));
    if (next !== text) { fs.writeFileSync(abs, next); done.push(f.file); }
  }
  return { head, done };
}

export function check(o) {
  const top = path.resolve(o.root, '..');   // catalog paths start at the simulator's parent («simulator/screens/…»), served as /
  const screens = catalog(o.root, top);
  if (o.stamp) return { stamped: stamp(o.root, flowDocs(o.root), o.base) };
  const flows = flowDocs(o.root), st = structure(o.root, screens, flows);
  const sy = o.structureOnly ? null : sync(o.root, screens, flows, st.namedBy, o.base);
  return { screens: Object.keys(screens).length, flows: flows.length, structure: st.problems, sync: sy };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let o;
  try { o = args(process.argv.slice(2)); } catch (e) { console.error(e.message || fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 19).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(2); }
  let r;
  try { r = check(o); } catch (e) { console.error('check-flows: ' + e.message); process.exit(e instanceof Usage ? 2 : 2); }
  if (r.stamped) { console.log(r.stamped.done.length ? `check-flows: ${LAST} ${r.stamped.head} in ${r.stamped.done.join(', ')}` : 'check-flows: no flow doc changed since ' + o.base + ' — nothing to stamp'); process.exit(0); }
  const sync = r.sync ? r.sync.problems : [], problems = [...r.structure, ...sync];
  for (const p of r.structure) console.log('✗ structure · ' + p);
  for (const p of sync) console.log('✗ sync · ' + p);
  if (r.sync) for (const f of r.sync.excusedHit) console.log('· excused by its commit message (Flows unchanged: …) · ' + f);
  const tail = `${r.flows} flow docs · ${r.screens} screens` + (r.sync ? ` · ${[...r.sync.changed].length} files changed since ${o.base} (${r.sync.mb.slice(0, 7)})` : ' · structure only');
  if (!problems.length) { console.log('check-flows: in step · ' + tail); process.exit(0); }
  if (o.allow && !r.structure.length) {
    console.log(`check-flows: let through (--allow) · ${tail}\n  put this line in the commit message:  Flows unchanged: ${o.allow}`);
    process.exit(0);
  }
  console.log(`check-flows: ${problems.length} problem${problems.length === 1 ? '' : 's'} · ${tail}` + (o.allow && r.structure.length ? ' · --allow never excuses structure' : ''));
  process.exit(1);
}
