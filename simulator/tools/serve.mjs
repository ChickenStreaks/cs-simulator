#!/usr/bin/env node
// «Like production»: the simulator served as a static host would serve it — no live reload, no index rebuilt on the fly
// (the committed simulator/generated/ files only), and pretty URLs as Cloudflare Pages does («pin.html» → 308 «pin»),
// because a prototype that works only with «.html» in the address breaks there (Shaman's lesson). The tests run against
// this server.
// Usage: node simulator/tools/serve.mjs [port=4712] [--no-pages]
import path from 'node:path';
import { createSite, listen } from '../server/site.mjs';

export async function start(port = 0, opts = {}) {
  const server = createSite({ pages: opts.pages !== false });
  await listen(server, port);
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const port = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) || 4712);
  start(port, { pages: !process.argv.includes('--no-pages') }).then((s) => console.log(`serve: http://127.0.0.1:${s.address().port}/simulator/ (like production${process.argv.includes('--no-pages') ? '' : ', pretty URLs'})`));
}
