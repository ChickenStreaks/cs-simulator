#!/usr/bin/env node
// Live preview for review rounds: serves this worktree on 127.0.0.1 (port 4710 by default) and reloads ONLY the screen's
// iframe when a screen changes (the shell keeps its state: the story, «Ver como», the clock), in about 2 s.
//   - a screen (simulator/screens/**, the tokens included) → the iframe reloads; a lane's logic or the blueprint → the index;
//   - catalog/, scenarios/, stories/, flows/ → the generated index is rebuilt (build-screens), then the page reloads;
//   - the shell (simulator/index.html, sim.js, shell/**) → the page reloads.
// Comments: the same API in-process (server/comments.mjs, files under ~/.cache/claude-builds/cs-simulator/comments), or
// forwarded to a running sidecar with WB_COMMENTS_URL=http://127.0.0.1:4711.
// The shell page names its build «<port>@<commit>» (<meta name="wb-sim-build">), which every comment carries.
// Usage: node simulator/tools/hot-serve.mjs [port=4710]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createSite, listen, SIM, ROOT } from '../server/site.mjs';
import { createCommentsApi, DEFAULT_DIR } from '../server/comments.mjs';
import { generate } from './build-screens.mjs';

const PORT = Number(process.argv[2] || process.env.WB_PORT || 4710);
let buildAt = 0, build = '';
function buildName() {
  if (Date.now() - buildAt > 2000) {
    buildAt = Date.now();
    try { build = PORT + '@' + execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: ROOT }).toString().trim() + (execFileSync('git', ['status', '--porcelain', '--', 'simulator'], { cwd: ROOT }).toString().trim() ? '+cambios' : ''); }
    catch { build = String(PORT); }
  }
  return build;
}

const CLIENT = `(function () {
  if (window.parent !== window || window.__wbHot) return; window.__wbHot = true;
  var es = new EventSource('/__hot'), tip = null;
  function say(t) { if (!document.body) return; if (!tip) { tip = document.createElement('div'); tip.setAttribute('aria-live', 'polite');
    tip.style.cssText = 'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:2147483647;background:#13161e;color:#f9fafe;font:600 13px/1.2 system-ui,sans-serif;padding:6px 10px;border-radius:8px;opacity:.92;pointer-events:none';
    document.body.appendChild(tip); } tip.textContent = t; clearTimeout(say.t); say.t = setTimeout(function () { if (tip) { tip.remove(); tip = null; } }, 1600); }
  es.addEventListener('frame', function () { if (window.WBShell && WBShell.reloadFrame) { say('Actualizado'); WBShell.reloadFrame(); } else location.reload(); });
  es.addEventListener('page', function () { location.reload(); });
})();`;

let api;
if (process.env.WB_COMMENTS_URL) {
  const up = new URL(process.env.WB_COMMENTS_URL);
  api = (req, res) => new Promise((resolve) => {
    const r = http.request({ host: up.hostname, port: up.port, path: req.url, method: req.method, headers: req.headers }, (ur) => { res.writeHead(ur.statusCode, ur.headers); ur.pipe(res); ur.on('end', () => resolve(true)); });
    r.on('error', () => { res.writeHead(502, { 'content-type': 'application/json' }); res.end('{"error":"comments_unreachable"}'); resolve(true); });
    req.pipe(r);
  });
} else api = createCommentsApi({ dir: DEFAULT_DIR, screensFile: path.join(SIM, 'screens.json'), build: buildName });

const clients = new Set();
function send(ev) { for (const r of clients) { try { r.write('event: ' + ev + '\ndata: ' + Date.now() + '\n\n'); } catch { clients.delete(r); } } console.log(new Date().toISOString().slice(11, 19), 'reload', ev, '→', clients.size, 'tab(s)'); }

const server = createSite({
  api,
  pre: (req, res) => {
    if (req.url === '/__hot') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write('retry: 1000\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return true;
    }
    if (req.url === '/__hot.js') { res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }); res.end(CLIENT); return true; }
    return false;
  },
  transformHtml: (p, html) => {
    if (p !== '/simulator/index.html') return html;
    return html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="wb-sim-build" content="' + buildName() + '">')
      .replace(/<\/body>(?![\s\S]*<\/body>)/i, '<script src="/__hot.js"></script></body>');
  }
});

/* the watcher */
let timer = null, kind = null;
const rank = { frame: 1, index: 2, page: 3 };
function queue(k) { if (!kind || rank[k] > rank[kind]) kind = k; clearTimeout(timer); timer = setTimeout(flush, 250); }
function flush() {
  const k = kind; kind = null;
  if (k === 'index') {
    const g = generate();
    if (g.bad.length) { console.error('build-screens: ' + g.bad.length + ' problem(s) — the index is not rebuilt\n  ' + g.bad.join('\n  ')); return; }
    for (const [f, t] of Object.entries(g.files)) if (!fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== t) fs.writeFileSync(f, t);
    return send('page');
  }
  send(k);
}
function watch(dir, fn) { if (fs.existsSync(dir)) fs.watch(dir, { recursive: true }, (ev, file) => { if (file) fn(String(file).split(path.sep).join('/')); }); }
watch(SIM, (f) => {
  if (/(^|\/)(node_modules|tests|generated)(\/|$)|~$|\.swp$|\.tmp$/.test(f) || f === 'screens.json') return;
  if (/^(catalog|scenarios|stories|flows)\//.test(f)) return queue('index');
  if (/^logic\//.test(f)) { queue('index'); return; }
  if (/^screens\//.test(f) || /^vendor\//.test(f)) return queue('frame');
  if (/^(index\.html|sim\.js|shell\/)/.test(f)) return queue('page');
});
watch(path.join(ROOT, 'blueprint', 'product'), () => queue('index'));   // a rule or a flow of the blueprint: the markers and flows read them

listen(server, PORT).then(() => console.log(`hot-serve: http://127.0.0.1:${PORT}/simulator/ · comments ${process.env.WB_COMMENTS_URL || DEFAULT_DIR}`), (e) => { console.error('hot-serve: ' + e.message); process.exit(1); });
