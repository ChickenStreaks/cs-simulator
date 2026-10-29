#!/usr/bin/env node
// «Like production»: the simulator served as a static host would serve it — no live reload, no index rebuilt on the fly
// (the committed simulator/generated/ files only), and pretty URLs as Cloudflare Pages does («pin.html» → 308 «pin»),
// because a prototype that works only with «.html» in the address breaks there (Shaman's lesson). Comments go to the same
// local API (server/comments.mjs). The tests run against this server.
// Usage: node simulator/tools/serve.mjs [port=4712] [--no-pages]   (env WB_COMMENTS_DIR for a throw-away comments folder)
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createSite, listen, SIM, ROOT } from '../server/site.mjs';
import { createCommentsApi, DEFAULT_DIR } from '../server/comments.mjs';

export async function start(port = 0, opts = {}) {
  let build = 'local';
  try { build = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: ROOT }).toString().trim(); } catch {}
  const dir = opts.commentsDir || process.env.WB_COMMENTS_DIR || DEFAULT_DIR;
  const api = createCommentsApi({ dir, screensFile: path.join(SIM, 'screens.json'), build: () => build });
  const server = createSite({
    api, pages: opts.pages !== false,
    transformHtml: (p, html) => (p === '/simulator/index.html' ? html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="wb-sim-build" content="' + build + '">') : html)
  });
  await listen(server, port);
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const port = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) || 4712);
  start(port, { pages: !process.argv.includes('--no-pages') }).then((s) => console.log(`serve: http://127.0.0.1:${s.address().port}/simulator/ (like production${process.argv.includes('--no-pages') ? '' : ', pretty URLs'})`));
}
