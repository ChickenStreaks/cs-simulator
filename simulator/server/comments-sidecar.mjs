#!/usr/bin/env node
// The comments backend alone, on its own port (default 4711, 127.0.0.1): for when the site is served by something else.
// tools/hot-serve.mjs forwards /api/* here when WB_COMMENTS_URL=http://127.0.0.1:4711 is set; otherwise it mounts the
// same API in-process. Env: WB_COMMENTS_PORT, WB_COMMENTS_DIR (default ~/.cache/claude-builds/cs-simulator/comments),
// WB_BUILD (the served commit, for rows whose page sent none).
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCommentsApi, DEFAULT_DIR } from './comments.mjs';

const SIM = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.WB_COMMENTS_PORT || 4711);
const api = createCommentsApi({ dir: DEFAULT_DIR, screensFile: path.join(SIM, 'screens.json'), build: () => process.env.WB_BUILD || null });
http.createServer(async (req, res) => {
  if (!(await api(req, res))) { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"error":"not_found"}'); }
}).listen(PORT, '127.0.0.1', () => console.log(`comments sidecar on http://127.0.0.1:${PORT}, data ${DEFAULT_DIR}`));
