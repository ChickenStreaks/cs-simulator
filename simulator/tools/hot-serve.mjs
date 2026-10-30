#!/usr/bin/env node
// Live preview for review rounds: serves this worktree on 127.0.0.1 (port 4710 by default) and reloads ONLY the screen's
// iframe when a screen changes (the shell keeps its state: «See as», the device), in about 2 s.
//   - a screen (simulator/screens/**, the tokens included) → the iframe reloads; a lane's logic or the blueprint → the index;
//   - catalog/, scenarios/, flows/ → the generated index is rebuilt (build-screens), then the page reloads;
//   - the pages (simulator/index.html, app.html, gallery.html), sim.js, shell/** → the page reloads.
// Usage: node simulator/tools/hot-serve.mjs [port=4710]
import fs from 'node:fs';
import path from 'node:path';
import { createSite, listen, SIM, ROOT } from '../server/site.mjs';
import { generate } from './build-screens.mjs';

const PORT = Number(process.argv[2] || process.env.WB_PORT || 4710);
const CLIENT = `(function () {
  if (window.parent !== window || window.__wbHot) return; window.__wbHot = true;
  var es = new EventSource('/__hot'), tip = null;
  function say(t) { if (!document.body) return; if (!tip) { tip = document.createElement('div'); tip.setAttribute('aria-live', 'polite');
    tip.style.cssText = 'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:2147483647;background:#13161e;color:#f9fafe;font:600 13px/1.2 system-ui,sans-serif;padding:6px 10px;border-radius:8px;opacity:.92;pointer-events:none';
    document.body.appendChild(tip); } tip.textContent = t; clearTimeout(say.t); say.t = setTimeout(function () { if (tip) { tip.remove(); tip = null; } }, 1600); }
  es.addEventListener('frame', function () { if (window.WBShell && WBShell.reloadFrame) { say('Actualizado'); WBShell.reloadFrame(); } else location.reload(); });
  es.addEventListener('page', function () { location.reload(); });
})();`;

const clients = new Set();
function send(ev) { for (const r of clients) { try { r.write('event: ' + ev + '\ndata: ' + Date.now() + '\n\n'); } catch { clients.delete(r); } } console.log(new Date().toISOString().slice(11, 19), 'reload', ev, '→', clients.size, 'tab(s)'); }

const server = createSite({
  pre: (req, res) => {
    if (req.url === '/__hot') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write('retry: 1000\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return true;
    }
    if (req.url === '/__hot.js') { res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }); res.end(CLIENT); return true; }
    return false;
  },
  transformHtml: (p, html) => {
    if (!/^\/simulator\/(index|app|gallery)\.html$/.test(p)) return html;   // the doors, the app, the gallery
    return html.replace(/<\/body>(?![\s\S]*<\/body>)/i, '<script src="/__hot.js"></script></body>');
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
  if (/^(catalog|scenarios|flows)\//.test(f)) return queue('index');
  if (/^logic\//.test(f)) { queue('index'); return; }
  if (/^screens\//.test(f) || /^vendor\//.test(f)) return queue('frame');
  if (/^((index|app|gallery)\.html|sim\.js|shell\/)/.test(f)) return queue('page');
});
watch(path.join(ROOT, 'blueprint', 'product'), () => queue('index'));   // a rule or a flow of the blueprint: the flows read them

listen(server, PORT).then(() => console.log(`hot-serve: http://127.0.0.1:${PORT}/simulator/`), (e) => { console.error('hot-serve: ' + e.message); process.exit(1); });
