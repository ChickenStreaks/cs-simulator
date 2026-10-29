// Payload rules of the simulator's comments. Pure functions shared by the local sidecar (server/comments.mjs) and the
// Cloudflare Pages Functions kept for later (server/cloudflare/): no I/O, Web APIs only.
// Rule of gold: a comment is never lost for something the server does not know (a screen newer than its screens.json,
// a screenshot too big, a runtime too large): it is stored with a flag. Only a malformed field is refused (400).

export const LIMITS = {
  body: 512 * 1024,   // request body, bytes (413)
  text: 1000,         // characters after trimming
  reply: 500,         // the answer to a comment, characters after trimming
  shot: 360 * 1024,   // decoded screenshot, bytes: its base64 fits the 512 KB body
  perMinute: 10,      // comments per author per UTC minute (429)
  perDay: 200,        // comments per author per UTC day (429)
  runtime: 8 * 1024   // the runtime object as stored (UTF-8 JSON); over it the runtime is dropped, the comment kept
};

export class Invalid extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
// ULID: 48-bit millisecond time + 80 random bits, Crockford base32 (26 characters): sorts by time.
export function ulid(now = Date.now()) {
  let t = now, s = '';
  for (let i = 0; i < 10; i++) { s = B32[t % 32] + s; t = Math.floor(t / 32); }
  const r = crypto.getRandomValues(new Uint8Array(16));
  for (let i = 0; i < 16; i++) s += B32[r[i] & 31];
  return s;
}

export function rateBuckets(now = new Date()) {
  const iso = now.toISOString();
  const nextDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return { minute: 'm:' + iso.slice(0, 16), day: 'd:' + iso.slice(0, 10), retryMinute: 60 - now.getUTCSeconds(), retryDay: Math.max(1, Math.ceil((nextDay - now.getTime()) / 1000)) };
}
export function rateRetryAfter(counts, b, limits = LIMITS) {
  if ((counts.day || 0) >= limits.perDay) return b.retryDay;
  if ((counts.minute || 0) >= limits.perMinute) return b.retryMinute;
  return null;
}

const chars = (s) => [...s].length;
function str(v, max, code, required = false) {
  if (v === undefined || v === null || v === '') { if (required) throw new Invalid(code + '_required'); return null; }
  if (typeof v !== 'string') throw new Invalid(code + '_type');
  if (chars(v) > max) throw new Invalid(code + '_too_long');
  return v;
}
function int(v, min, max, code) {
  if (v === undefined || v === null) return null;
  if (!Number.isInteger(v) || v < min || v > max) throw new Invalid(code + '_invalid');
  return v;
}
function num(v, min, max, code) {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Invalid(code + '_invalid');
  return v;
}
function obj(v, code) {
  if (v === undefined || v === null) return {};
  if (typeof v !== 'object' || Array.isArray(v)) throw new Invalid(code + '_type');
  return v;
}
// a short id-like string (story ids, scenario ids, people ids): never a reason to refuse — anything else becomes null
function slug(v, max = 64) { return typeof v === 'string' && v.length <= max && /^[A-Za-z0-9_.:@-]+$/.test(v) ? v : null; }

// screens: the parsed simulator/screens.json ({ "<screen id>": { "states": [...] } })
export function knownState(screens, screen, state) {
  const s = Object.prototype.hasOwnProperty.call(screens || {}, screen) ? screens[screen] : null;
  return !!(s && Array.isArray(s.states) && s.states.includes(state));
}

const MAGIC = {
  'image/jpeg': (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) => b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP'
};
export function decodeShot(dataUrl) {
  if (typeof dataUrl !== 'string') return { error: 'bad_type' };
  const m = /^data:(image\/jpeg|image\/webp);base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
  if (!m) return { error: 'bad_type' };
  if (Math.floor(m[2].length * 3 / 4) - m[2].match(/=*$/)[0].length > LIMITS.shot) return { error: 'too_large' };
  let bin; try { bin = atob(m[2]); } catch { return { error: 'bad_type' }; }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (!MAGIC[m[1]](bytes)) return { error: 'bad_type' };
  return { mime: m[1], bytes };
}
function shotErrorCode(v) { if (v === undefined || v === null || v === '') return null; return typeof v === 'string' && /^[a-z_]{1,32}$/.test(v) ? v : 'other'; }

export function runtimeOf(v) {
  if (v === undefined || v === null) return { json: null, state: 'none' };
  if (typeof v !== 'object' || Array.isArray(v)) return { json: null, state: 'dropped' };
  const json = JSON.stringify(v);
  if (new TextEncoder().encode(json).length > LIMITS.runtime) return { json: null, state: 'dropped' };
  return { json, state: 'stored' };
}

/* POST /api/comments body → { row, shot, shotError, runtime }. The row's columns (server/cloudflare/migrations/0001_comments.sql):
   kind 'pin' | 'story_end'; screen, state (a pair screens.json does not list is kept with screen_unknown = 1);
   element { selector, path, label }; pin { x, y } in 0..1 of the element; viewport { w, h, dpr };
   context { theme, device, scenario, view_as { person, name, role, context }, sim_time, story, step, situation, build };
   text (≤ 1000, required for a pin); thumbs 'up'|'down' (story_end); screenshot | screenshot_error; runtime; client_ts */
export function parseComment(body, screens) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Invalid('body_type');
  const kind = body.kind;
  if (kind !== 'pin' && kind !== 'story_end') throw new Invalid('kind_invalid');
  const screen = str(body.screen, 64, 'screen', true) ;
  const state = str(body.state, 64, 'state', true);
  let text = body.text === undefined || body.text === null ? null : body.text;
  if (text !== null) {
    if (typeof text !== 'string') throw new Invalid('text_type');
    text = text.trim();
    if (chars(text) > LIMITS.text) throw new Invalid('text_too_long');
    if (text === '') text = null;
  }
  if (kind === 'pin' && text === null) throw new Invalid('text_required');
  let thumbs = null;
  if (kind === 'story_end') { thumbs = body.thumbs; if (thumbs !== 'up' && thumbs !== 'down') throw new Invalid('thumbs_invalid'); }
  const el = kind === 'pin' ? obj(body.element, 'element') : {};
  const pin = kind === 'pin' ? obj(body.pin, 'pin') : {};
  const vp = obj(body.viewport, 'viewport'), ctx = obj(body.context, 'context'), va = obj(ctx.view_as, 'view_as');
  const row = {
    client_ts: str(body.client_ts, 40, 'client_ts'),
    kind, thumbs, screen, state, screen_unknown: knownState(screens, screen, state) ? 0 : 1,
    el_selector: str(el.selector, 256, 'element_selector'),
    el_path: str(el.path, 512, 'element_path'),
    el_label: str(el.label, 120, 'element_label'),
    pin_x: num(pin.x, 0, 1, 'pin_x'), pin_y: num(pin.y, 0, 1, 'pin_y'),
    vp_w: int(vp.w, 1, 10000, 'viewport_w'), vp_h: int(vp.h, 1, 10000, 'viewport_h'), dpr: num(vp.dpr, 0.1, 10, 'viewport_dpr'),
    theme: slug(ctx.theme, 16), device: slug(ctx.device, 16), scenario: slug(ctx.scenario),
    view_as_person: slug(va.person), view_as_name: str(typeof va.name === 'string' ? va.name : null, 80, 'view_as_name'),
    view_as_role: slug(va.role, 32), view_as_context: slug(va.context),
    sim_time: str(typeof ctx.sim_time === 'string' ? ctx.sim_time : null, 40, 'sim_time'),
    story: slug(ctx.story), step: int(ctx.step, 1, 99, 'step'), situation: slug(ctx.situation),
    build: str(typeof ctx.build === 'string' ? ctx.build : null, 64, 'build'),
    // the exact moment, to reopen it (inspiration idea 1): the screen's params, the clock's offset from the wall clock
    params: paramsJson(ctx.params), clock_offset_ms: Number.isInteger(ctx.clock_offset_ms) && Math.abs(ctx.clock_offset_ms) <= 3.2e11 ? ctx.clock_offset_ms : null,
    // «Sigue igual» (idea 3): the comment this one reopens; a malformed id is dropped, never the comment
    reply_to: typeof body.reply_to === 'string' && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(body.reply_to) ? body.reply_to : null,
    text
  };
  if (kind === 'story_end' && !row.story) throw new Invalid('story_required');
  let shot = null, shotError = null;
  if (kind === 'pin' && body.screenshot !== undefined && body.screenshot !== null) {
    const d = decodeShot(body.screenshot);
    if (d.error) shotError = d.error; else shot = d;
  }
  row.shot_error = kind === 'pin' && !shot ? shotError || shotErrorCode(body.screenshot_error) : null;
  const rt = runtimeOf(body.runtime);
  row.runtime = rt.json;
  return { row, shot, shotError, runtime: rt.state };
}

// a screen's params as stored: flat strings, ≤ 1 KB, else none (never a reason to refuse the comment)
function paramsJson(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  const o = {};
  for (const [k, v] of Object.entries(p)) if (/^[A-Za-z0-9_.-]{1,40}$/.test(k) && k !== 'estado' && (typeof v === 'string' || typeof v === 'number')) o[k] = String(v).slice(0, 200);
  const j = JSON.stringify(o);
  return j === '{}' || j.length > 1024 ? null : j;
}

export function parseStoryEvent(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Invalid('body_type');
  const story = slug(body.story);
  if (!story) throw new Invalid('story_required');
  if (body.event !== 'started' && body.event !== 'completed' && body.event !== 'quit') throw new Invalid('event_invalid');
  // where people quit (inspiration idea 4): the step a quit happened on
  const step = body.event === 'quit' && Number.isInteger(body.step) && body.step >= 1 && body.step <= 99 ? body.step : null;
  return { story, event: body.event, step };
}

/* ---- status and reply (Addition 11): the AI that listens answers each comment ----
   A comment row is never rewritten: each change is an event appended next to it ({ comment, at, by, status?, commit?,
   reply? }) and the row's current status, reply and commit are the latest events, merged when read. States, by code
   (stored) and by the words the person reads: */
export const STATUSES = { new: 'nuevo', seen: 'visto', fixing: 'en arreglo', done: 'hecho', needs_decision: 'necesita decisión', wontfix: 'no se hará' };
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s_-]+/g, ' ').trim();
const BY_WORDS = Object.fromEntries(Object.entries(STATUSES).flatMap(([code, words]) => [[fold(code), code], [fold(words), code]]));
export const COMMENT_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

// «en arreglo», «Hecho», «needs_decision», «necesita decision» → the code; anything else is kept as written, with a flag
export function parseStatus(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Invalid('body_type');
  const raw = str(body.status, 40, 'status', true).trim();
  if (!raw) throw new Invalid('status_required');
  const code = BY_WORDS[fold(raw)];
  const commit = str(body.commit, 40, 'commit');
  if (commit !== null && !/^[0-9a-f]{7,40}$/i.test(commit)) throw new Invalid('commit_invalid');
  return Object.assign({ status: code || raw, status_unknown: code ? 0 : 1 }, commit ? { commit: commit.toLowerCase() } : {});
}
export function parseReply(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Invalid('body_type');
  const text = str(body.text, LIMITS.reply + 200, 'text', true).trim();
  if (!text) throw new Invalid('text_required');
  if (chars(text) > LIMITS.reply) throw new Invalid('text_too_long');
  return { reply: text };
}
// rows (comments.jsonl or D1) + events → each row with status, status_label, status_unknown, reply, reply_at, commit,
// updated_at and its history; events of a comment that is not there are ignored, malformed ones skipped
export function mergeEvents(rows, events) {
  const by = new Map();
  for (const e of events || []) {
    if (!e || typeof e !== 'object' || typeof e.comment !== 'string') continue;
    (by.get(e.comment) || by.set(e.comment, []).get(e.comment)).push(e);
  }
  return rows.map((r0) => {
    const r = Object.assign({}, r0, { status: r0.status === 'new' || !r0.status ? 'new' : r0.status, status_unknown: 0, reply: null, reply_at: null, commit: null, updated_at: null, history: [] });
    for (const e of (by.get(r.id) || []).slice().sort((a, b) => String(a.at).localeCompare(String(b.at)))) {
      if (typeof e.status === 'string' && e.status) { r.status = e.status; r.status_unknown = e.status_unknown ? 1 : (STATUSES[e.status] ? 0 : 1); }
      if (typeof e.commit === 'string' && e.commit) r.commit = e.commit;
      if (typeof e.reply === 'string' && e.reply) { r.reply = e.reply; r.reply_at = e.at || null; }
      r.updated_at = e.at || r.updated_at;
      r.history.push({ at: e.at || null, by: e.by || null, status: e.status || null, commit: e.commit || null, reply: e.reply || null });
    }
    if (!STATUSES[r.status]) r.status_unknown = 1;
    r.status_label = STATUSES[r.status] || r.status;
    return r;
  });
}

export function listVar(v) { return new Set(String(v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)); }
