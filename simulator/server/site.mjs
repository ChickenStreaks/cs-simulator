// The simulator's static site, shared by tools/hot-serve.mjs (live, this worktree) and tools/serve.mjs («like production»).
// Serves the repository read-only, with the paths the simulator uses:
//   /                         → 302 /simulator/
//   /simulator/…              → the shell, sim.js, screens, generated index …
//   /blueprint/…              → read-only inputs (the product rules, flows and screen specs)
//   a screen file the catalog knows by an alias (an Open Design prototype's name) → 302 to the screen's current file,
//     so a prototype's own link to an old file name lands on whatever the catalog says that screen is today
//   /api/…                    → the comments backend (server/comments.mjs), mounted by the caller
// Only 127.0.0.1. GET and HEAD only, except /api/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SIM = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// the root is packages/: the simulator and the blueprint side by side, served as /simulator/ and /blueprint/
export const ROOT = path.resolve(SIM, "..");
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.md': 'text/plain; charset=utf-8', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
// what may be served: the simulator, the read-only inputs it reads, nothing else of the repo (no .git, no node_modules)
const ALLOWED = /^\/(simulator|blueprint)\//;
const DENIED = /(^|\/)(\.|node_modules\/|tests\/results)/;

export function aliasMap(root) {
  const map = {};
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(root, 'simulator', 'screens.json'), 'utf8'));
    for (const [id, s] of Object.entries(idx)) for (const a of s.aliases || []) map[a] = '/' + s.file;
  } catch (e) { /* no screens.json yet */ }
  return map;
}

// options: { root, api (req, res) => handled?, transformHtml (url, html) => html, dynamic { '/path': () => text }, headers }
export function createSite(opts) {
  const root = opts.root || ROOT;
  const screensJson = () => { try { return JSON.parse(fs.readFileSync(path.join(root, 'simulator', 'screens.json'), 'utf8')); } catch (e) { return {}; } };
  return http.createServer(async (req, res) => {
    try {
      if (opts.pre && await opts.pre(req, res)) return;
      const u = new URL(req.url, 'http://x');
      let p = decodeURIComponent(u.pathname);
      // «like production»: pretty URLs as Cloudflare Pages serves them — «x.html» answers 308 to «x», «x» serves x.html
      if (opts.pages && /^\/(simulator|blueprint)\//.test(p)) {
        if (/\.html$/.test(p) && !/\/index\.html$/.test(p)) { res.writeHead(308, { location: p.slice(0, -5) + u.search }); return res.end(); }
        if (!/\.[a-z0-9]+$/i.test(p) && !p.endsWith('/') && fs.existsSync(path.join(root, p + '.html'))) p += '.html';
      }
      if (p.startsWith('/api/')) { if (opts.api && await opts.api(req, res)) return; res.writeHead(404, { 'content-type': 'application/json' }); return res.end('{"error":"not_found"}'); }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { allow: 'GET, HEAD' }); return res.end(); }
      if (p === '/' || p === '/simulator') { res.writeHead(302, { location: '/simulator/' + u.search }); return res.end(); }
      if (p.endsWith('/')) p += 'index.html';
      if (opts.dynamic && opts.dynamic[p]) { const body = await opts.dynamic[p](); res.writeHead(200, Object.assign({ 'content-type': TYPES[path.extname(p)] || 'text/plain', 'cache-control': 'no-store' }, opts.headers || {})); return res.end(body); }
      let f = path.join(root, p);
      if (!ALLOWED.test(p) || DENIED.test(p) || !f.startsWith(root + path.sep)) { res.writeHead(404); return res.end('not found'); }
      if (!fs.existsSync(f) || !fs.statSync(f).isFile()) {
        // a prototype's file name the catalog lists as an alias → the screen's current file (query kept)
        const bare = (n) => n.replace(/\.html$/, ''), name = bare(p.split('/').pop());
        const hit = /^\/(simulator|blueprint)\//.test(p) && Object.values(screensJson()).find((s) => (s.aliases || []).map(bare).includes(name));
        if (hit && '/' + hit.file !== p) { res.writeHead(302, { location: '/' + (opts.pages ? bare(hit.file) : hit.file) + u.search, 'cache-control': 'no-store' }); return res.end(); }
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('not found');
      }
      const type = TYPES[path.extname(f)] || 'application/octet-stream';
      const headers = Object.assign({ 'content-type': type, 'cache-control': /\.woff2$/.test(f) ? 'public, max-age=3600' : 'no-store', 'x-content-type-options': 'nosniff', 'x-frame-options': 'SAMEORIGIN' }, opts.headers || {});
      if (/\.html$/.test(f) && opts.transformHtml) {
        const html = opts.transformHtml(p, fs.readFileSync(f, 'utf8'));
        res.writeHead(200, headers); return res.end(req.method === 'HEAD' ? undefined : html);
      }
      res.writeHead(200, headers);
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(f).pipe(res);
    } catch (e) {
      console.error('site error', e && e.message);
      if (!res.headersSent) res.writeHead(500); res.end('error');
    }
  });
}

export function listen(server, port, host = '127.0.0.1') {
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => resolve(server)); });
}
