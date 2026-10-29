// The simulator's local comments backend (the twin of server/cloudflare/functions/api/, same contract, writing files):
//   GET  /api/me           → 200 { email: 'local', designer: true }
//   POST /api/comments     → 201 { id, server_ts, screenshot: 'stored'|'dropped'|'none', screenshot_error?, runtime, screen_unknown }
//   POST /api/story-event  → 204   body { story, event: 'started'|'completed' }  (counts only, no person)
//   GET  /api/comments/mine          → 200 { comments: [row with status, status_label, reply, commit…], now }, newest first
//   GET  /api/comments/<id>/shot     → the screenshot (image/jpeg|webp) or 404
//   POST /api/comments/<id>/status   → 200 row   body { status: 'visto'|'en arreglo'|'hecho'|…, commit? }
//   POST /api/comments/<id>/reply    → 200 row   body { text }
// Files, outside the repo: <dir>/comments.jsonl (one row a line), <dir>/shots/<id>.jpg|.webp, <dir>/story-counts.json,
// <dir>/comment-events.jsonl (status and replies: appended, never rewritten; validate.mjs mergeEvents reads them).
// Locally everyone is «local», so «mine» is every comment of this machine.
// Default dir ~/.cache/claude-builds/cs-simulator/comments (WB_COMMENTS_DIR). Never refuses a comment for a screen it does not
// know: it is stored with screen_unknown = 1 (validate.mjs). Mounted by tools/hot-serve.mjs and tools/serve.mjs, or alone:
//   node simulator/server/comments-sidecar.mjs   (port 4711, WB_COMMENTS_PORT)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LIMITS, Invalid, parseComment, parseStoryEvent, parseStatus, parseReply, mergeEvents, COMMENT_ID, ulid, rateBuckets, rateRetryAfter } from './validate.mjs';

export const DEFAULT_DIR = process.env.WB_COMMENTS_DIR || path.join(os.homedir(), '.cache', 'claude-builds', 'cs-simulator', 'comments');
const EXT = { 'image/jpeg': '.jpg', 'image/webp': '.webp' };

function send(res, status, value, extra = {}) {
  res.writeHead(status, Object.assign({ 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }, value === null ? {} : { 'content-type': 'application/json; charset=utf-8' }, extra));
  res.end(value === null ? '' : JSON.stringify(value));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    if (Number(req.headers['content-length'] || 0) > LIMITS.body) return reject(new Invalid('body_too_large', 413));
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > LIMITS.body) { req.destroy(); reject(new Invalid('body_too_large', 413)); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))); } catch { reject(new Invalid('bad_json')); } });
    req.on('error', reject);
  });
}
// same origin only: the browser's Origin must be the Host it used. http or https, because a TLS proxy in front
// (tailscale serve on the tailnet) forwards an https page to this plain-http server with the same Host.
function sameOrigin(req) {
  const host = req.headers.host, origin = req.headers.origin;
  if (!host || !origin) return false;
  try { const o = new URL(origin); return (o.protocol === 'http:' || o.protocol === 'https:') && o.host === host; } catch { return false; }
}
function postGate(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' }, { allow: 'POST' }), false;
  if (!/^application\/json(\s*;|$)/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'json_required' }), false;
  if (!sameOrigin(req)) return send(res, 403, { error: 'bad_origin' }), false;
  return true;
}

// opts: { dir, screensFile, build () → string|null (the served commit, for rows whose page sent none) }
export function createCommentsApi(opts = {}) {
  const dir = opts.dir || DEFAULT_DIR;
  fs.mkdirSync(path.join(dir, 'shots'), { recursive: true });
  let screens = { at: 0, value: {} };
  const loadScreens = () => {
    if (Date.now() - screens.at > 2000) { try { screens = { at: Date.now(), value: JSON.parse(fs.readFileSync(opts.screensFile, 'utf8')) }; } catch { screens = { at: Date.now(), value: {} }; } }
    return screens.value;
  };
  const rate = new Map();
  // a test server posts many comments as one «local» author in a minute: WB_COMMENTS_PER_MINUTE raises its limit (default 10)
  const limits = Object.assign({}, LIMITS, Number(process.env.WB_COMMENTS_PER_MINUTE) > 0 ? { perMinute: Number(process.env.WB_COMMENTS_PER_MINUTE) } : {});
  const countsFile = path.join(dir, 'story-counts.json');

  async function comments(req, res) {
    if (!postGate(req, res)) return;
    const { row, shot, shotError, runtime } = parseComment(await readBody(req), loadScreens());
    if (!row.build && opts.build) row.build = opts.build();
    const now = new Date(), b = rateBuckets(now);
    const retry = rateRetryAfter({ minute: rate.get(b.minute) || 0, day: rate.get(b.day) || 0 }, b, limits);
    if (retry !== null) return send(res, 429, { error: 'rate_limited' }, { 'retry-after': String(retry) });
    for (const k of rate.keys()) if (k !== b.minute && k !== b.day) rate.delete(k);
    rate.set(b.minute, (rate.get(b.minute) || 0) + 1); rate.set(b.day, (rate.get(b.day) || 0) + 1);
    const id = ulid(now.getTime());
    if (shot) fs.writeFileSync(path.join(dir, 'shots', id + EXT[shot.mime]), shot.bytes);
    const full = Object.assign({ id, server_ts: now.toISOString(), author: 'local' }, row, { runtime: row.runtime && JSON.parse(row.runtime), params: row.params && JSON.parse(row.params), status: 'new', has_shot: shot ? 1 : 0 });
    fs.appendFileSync(path.join(dir, 'comments.jsonl'), JSON.stringify(full) + '\n');
    send(res, 201, Object.assign({ id, server_ts: full.server_ts, screenshot: shot ? 'stored' : shotError ? 'dropped' : 'none', runtime, screen_unknown: row.screen_unknown }, shotError ? { screenshot_error: shotError } : {}));
  }
  async function storyEvent(req, res) {
    if (!postGate(req, res)) return;
    const { story, event, step } = parseStoryEvent(await readBody(req));
    let all = {}; try { all = JSON.parse(fs.readFileSync(countsFile, 'utf8')); } catch {}
    const key = new Date().toISOString().slice(0, 10) + '|' + story + '|' + event + (event === 'quit' && step ? '@' + step : '');
    all[key] = (all[key] || 0) + 1;
    fs.writeFileSync(countsFile + '.tmp', JSON.stringify(all, null, 1)); fs.renameSync(countsFile + '.tmp', countsFile);
    send(res, 204, null);
  }
  function me(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method_not_allowed' }, { allow: 'GET' });
    send(res, 200, { email: 'local', designer: true });
  }

  /* status and reply: the comment rows stay as they were written; each change is one more line of comment-events.jsonl */
  const eventsFile = path.join(dir, 'comment-events.jsonl');
  const jsonl = (file) => {
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const out = [];
    for (const line of text.split('\n')) if (line.trim()) { try { out.push(JSON.parse(line)); } catch {} }   // a half-written line: skipped
    return out;
  };
  // every row, merged; when the events cannot be read the comments still come, with the status they were written with
  function merged() {
    const rows = jsonl(path.join(dir, 'comments.jsonl'));
    let events = [], eventsError = null;
    try { events = jsonl(eventsFile); } catch (e) { eventsError = e.code || 'unreadable'; console.error('comment events unreadable:', e.message); }
    return { rows: mergeEvents(rows, events), eventsError };
  }
  const LIGHT = ['id', 'server_ts', 'kind', 'thumbs', 'screen', 'state', 'params', 'sim_time', 'clock_offset_ms', 'reply_to', 'el_selector', 'screen_unknown', 'el_label', 'text', 'scenario', 'situation', 'story', 'step',
    'view_as_person', 'view_as_name', 'view_as_role', 'view_as_context', 'has_shot', 'status', 'status_label', 'status_unknown', 'reply', 'reply_at', 'commit', 'updated_at'];
  const light = (r) => Object.fromEntries(LIGHT.map((k) => [k, r[k] === undefined ? null : r[k]]));
  function mine(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method_not_allowed' }, { allow: 'GET' });
    const { rows, eventsError } = merged();
    const list = rows.filter((r) => (r.author || 'local') === 'local').sort((a, b) => String(b.server_ts).localeCompare(String(a.server_ts))).slice(0, 100).map(light);
    send(res, 200, Object.assign({ comments: list, now: new Date().toISOString() }, eventsError ? { events_error: eventsError } : {}));
  }
  function shot(req, res, id) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method_not_allowed' }, { allow: 'GET' });
    for (const [mime, ext] of Object.entries(EXT)) {
      const f = path.join(dir, 'shots', id + ext);
      if (fs.existsSync(f)) { res.writeHead(200, { 'content-type': mime, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' }); return res.end(req.method === 'HEAD' ? '' : fs.readFileSync(f)); }
    }
    send(res, 404, { error: 'not_found' });
  }
  async function change(req, res, id, what) {
    if (!postGate(req, res)) return;
    const body = await readBody(req), ev = what === 'status' ? parseStatus(body) : parseReply(body);
    if (!merged().rows.some((r) => r.id === id)) return send(res, 404, { error: 'not_found' });
    fs.appendFileSync(eventsFile, JSON.stringify(Object.assign({ comment: id, at: new Date().toISOString(), by: 'api' }, ev)) + '\n');
    send(res, 200, light(merged().rows.find((r) => r.id === id)));
  }
  const ROUTES = { '/api/comments': comments, '/api/story-event': storyEvent, '/api/me': me, '/api/comments/mine': mine };
  const route = (pathname) => {
    if (ROUTES[pathname]) return ROUTES[pathname];
    const m = /^\/api\/comments\/([^/]+)\/(status|reply|shot)$/.exec(pathname);
    if (!m) return null;
    if (!COMMENT_ID.test(m[1])) return (req, res) => send(res, 404, { error: 'not_found' });
    return m[2] === 'shot' ? (req, res) => shot(req, res, m[1]) : (req, res) => change(req, res, m[1], m[2]);
  };

  // → true when it answered
  return async function api(req, res) {
    const handler = route(new URL(req.url, 'http://x').pathname);
    if (!handler) return false;
    try { await handler(req, res); }
    catch (e) {
      if (e instanceof Invalid) send(res, e.status, { error: e.code });
      else { console.error('comments error', e && e.message); send(res, 500, { error: 'internal' }); }
    }
    return true;
  };
}
