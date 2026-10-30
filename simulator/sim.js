/* ==========================================================================
   ChickenStreaks simulator · sim.js — the `WB` API (contract v1, simulator/CONTRACT.md)
   (Ported from the Wirebit simulator; the API keeps its name `WB` so the shell, tools and tests stay in step.)

   Every page of the simulator loads this file first, as a plain blocking script in <head>:
       <script src="/simulator/sim.js"></script>
   It defines window.WB, then loads (in order, before the page's own scripts run):
     1. simulator/generated/index.js — WB_INDEX: catalog, scenarios, logic files (GENERATED);
     2. simulator/logic/<lane>.js   — each lane's logic, which may replace WB.can or WB.role;
     3. WB.__boot()                   — the store is read (or seeded) and WB.ready callbacks run.

   One simulated state for the whole visit, kept in localStorage (`cs-sim/v1`): every document of the
   simulator (the shell and the screen in its iframe) reads the same store, and a write in one is seen by the
   others through the `storage` event. Eggs and streaks are never stored: they are derived from the records
   (marks, redemptions, forgives …) by the logic (huevos R4).
   ========================================================================== */
(function () {
  'use strict';
  if (window.WB && window.WB.contract) return;   // loaded twice: keep the first

  var CONTRACT = '1';
  var KEY = 'cs-sim/v1';
  var TZ = 'America/Mexico_City', TZ_OFFSET = '-06:00';   // Mexico has no daylight saving since 2022
  var HOUR = 3600e3, DAY = 24 * HOUR;

  var script = document.currentScript;
  var BASE = script ? new URL('.', script.src).href : new URL('/simulator/', location.href).href;   // …/simulator/
  var ROOT = new URL('..', BASE).href;                                                              // the repo root

  /* ---------- small helpers ---------- */
  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function warn(msg) { try { console.warn('[WB] ' + msg); } catch (e) {} }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  var seq = 0;
  function newId(prefix) { seq = (seq + 1) % 1e6; return prefix + '-' + Date.now().toString(36) + seq.toString(36) + Math.random().toString(36).slice(2, 5); }

  /* ---------- where this document is ---------- */
  var host = null;   // the shell's bridge when this page is the screen inside the simulator's iframe
  /* a still (?still=1&as=<person>): a screen shown only to be looked at (the gallery). It sees the standard family,
     fresh and in memory, as that person; it never navigates, never saves and never hears the other documents. */
  var still = /[?&]still=1(&|$)/.test(location.search), stillAs = (/[?&]as=([^&#]+)/.exec(location.search) || [])[1] || null;
  try { if (!still && window.parent !== window && window.parent.WBShell) host = window.parent.WBShell; } catch (e) { host = null; }

  var WB = window.WB = {
    contract: CONTRACT,
    base: BASE,
    root: ROOT,
    embedded: !!host,                              // true: inside the shell's iframe
    isHost: !host && !still,                       // true: the shell itself, or a screen opened alone
    still: still,                                  // true: a still, for looking only (the gallery)
    index: null                                    // WB_INDEX once loaded
  };

  /* ==========================================================================
     Events
     ========================================================================== */
  var subs = [];
  WB.subscribe = function (fn) { subs.push(fn); return function () { subs = subs.filter(function (f) { return f !== fn; }); }; };
  function emit(ev) { subs.slice().forEach(function (fn) { try { fn(ev); } catch (e) { console.error(e); } }); }

  /* ==========================================================================
     Store: { v, scenario, seededAt, world, ctx }
       world = people, chores, marks, prizes, redemptions, forgives, pauses, lovis, goals, settings, audit, ext
       ctx   = viewAs { person }, clock { start, offsetMs }, session { signedIn, person, since },
               theme 'auto'|'light'|'dark'
     ========================================================================== */
  var cache = null;
  function read() {
    if (cache) return cache;
    if (still) return (cache = stillWorld());
    var raw = lsGet(KEY), s = null;
    if (raw) { try { s = JSON.parse(raw); } catch (e) { s = null; } }
    if (!s || s.v !== 1 || !s.world || !s.ctx) s = null;
    if (!s && WB.index) s = seed(WB.index.defaultScenario);
    cache = s;
    return s;
  }
  // a write starts from what is stored, never from this document's copy: the other document (shell or screen) may have
  // written a moment ago and its `storage` event not arrived yet
  function fresh() { if (!still) cache = null; return read(); }
  // a still's world: the default scenario seeded in memory, seen as its person, in the visitor's saved theme
  function stillWorld() {
    if (!WB.index) return null;
    var saved = null; try { saved = JSON.parse(lsGet(KEY)); } catch (e) {}
    var s = seed(WB.index.defaultScenario);
    if (saved && saved.ctx && saved.ctx.theme) s.ctx.theme = saved.ctx.theme;
    if (stillAs) s.ctx.viewAs.person = decodeURIComponent(stillAs);
    return s;
  }
  function write(s, ev) {
    cache = s;
    if (!still) lsSet(KEY, JSON.stringify(s));
    emit(ev || { type: 'state' });
  }
  window.addEventListener('storage', function (e) {
    if (still || (e.key !== KEY && e.key !== null)) return;
    var before = cache && cache.ctx && cache.ctx.theme;
    cache = null;
    emit({ type: 'external' });
    var s = read();
    if (s && s.ctx.theme !== before) { applyTheme(); emit({ type: 'theme' }); }
  });

  /* ---------- scenarios ---------- */
  var COLLECTIONS = ['people', 'chores', 'marks', 'prizes', 'redemptions', 'forgives', 'pauses', 'lovis', 'goals'];
  // the fields that hold a time («-2d@09:30») and those that hold a day («-1d» → '2026-10-27', Mexico City)
  var TIME_FIELDS = ['at', 'createdAt', 'approvedAt', 'redoAt', 'deliveredAt', 'pairedAt', 'removedAt', 'archivedAt', 'from', 'until'];
  var DAY_FIELDS = ['day'];

  function scenarioDef(id) {
    var all = (WB.index && WB.index.scenarios) || {};
    if (!own(all, id)) throw new Error('WB: unknown scenario «' + id + '»');
    return all[id];
  }
  // A scenario extends another: collections merge by id (a later item replaces the earlier one, {id, _delete: true} removes it);
  // settings and ext merge shallowly; the deepest scenario's viewAs, session and theme win.
  function resolveScenario(id, seen) {
    seen = seen || [];
    if (seen.indexOf(id) >= 0) throw new Error('WB: scenario loop ' + seen.concat(id).join(' → '));
    var def = scenarioDef(id), base = def.extends ? resolveScenario(def.extends, seen.concat(id)) : { data: {}, viewAs: null, session: null };
    var data = clone(base.data), add = def.data || {};
    COLLECTIONS.forEach(function (c) {
      var list = (data[c] || []).slice();
      (add[c] || []).forEach(function (it) {
        var i = list.findIndex(function (x) { return x.id === it.id; });
        if (it._delete) { if (i >= 0) list.splice(i, 1); return; }
        if (i >= 0) list[i] = clone(it); else list.push(clone(it));
      });
      data[c] = list;
    });
    data.settings = Object.assign({}, data.settings || {}, add.settings || {});
    data.ext = Object.assign({}, data.ext || {}, add.ext || {});
    return { data: data, viewAs: def.viewAs || base.viewAs, session: def.session || base.session, theme: def.theme || base.theme };
  }

  // Relative times in scenario files: "now", "-3d", "+20h", "-90m", "-2d@09:30" (that local day at 09:30), or an ISO time.
  function when(v, now) {
    if (v == null || v === '') return null;
    if (typeof v !== 'string') throw new Error('WB: time must be a string: ' + JSON.stringify(v));
    if (v === 'now') return new Date(now).toISOString();
    var m = /^([+-]\d+(?:\.\d+)?)([mhd])(?:@(\d{2}):(\d{2}))?$/.exec(v);
    if (m) {
      var n = Number(m[1]), unit = { m: 60e3, h: HOUR, d: DAY }[m[2]], t = now + n * unit;
      if (m[3]) {   // that day, at hh:mm in Mexico City
        var day = localParts(new Date(t));
        t = Date.parse(day.date + 'T' + m[3] + ':' + m[4] + ':00' + TZ_OFFSET);
      }
      return new Date(t).toISOString();
    }
    var abs = Date.parse(v);
    if (isNaN(abs)) throw new Error('WB: bad time «' + v + '»');
    return new Date(abs).toISOString();
  }

  function seed(id, opts) {
    opts = opts || {};
    var sc = resolveScenario(id), now = opts.now || Math.floor(Date.now() / 60e3) * 60e3;
    var w = sc.data;
    COLLECTIONS.forEach(function (c) { w[c] = w[c] || []; });
    w.audit = []; w.settings = w.settings || {}; w.ext = w.ext || {};
    COLLECTIONS.forEach(function (c) { w[c].forEach(function (o) { fixTimes(o, now); }); });
    var person = (sc.viewAs && sc.viewAs.person) || (w.people[0] && w.people[0].id) || null;
    return {
      v: 1, scenario: id, seededAt: new Date(now).toISOString(), world: w,
      ctx: {
        viewAs: { person: person },
        clock: { start: new Date(now).toISOString(), offsetMs: 0 },
        session: Object.assign({ signedIn: false, person: person, since: null }, sc.session || {}),
        theme: (cache && cache.ctx && cache.ctx.theme) || sc.theme || 'auto'
      }
    };
  }

  /* ==========================================================================
     WB.state — the world (read, update, subscribe)
     ========================================================================== */
  WB.state = {
    // The whole world (a copy), or one collection, or one item: get(), get('chores'), get('people', 'p-sofia').
    get: function (col, id) {
      var w = read().world;
      if (!col) return clone(w);
      var v = w[col];
      if (id === undefined) return clone(v);
      return clone((v || []).find(function (x) { return x.id === id; }) || null);
    },
    // list('chores', c => c.kids.includes('p-sofia'))
    list: function (col, filter) { var l = clone(read().world[col] || []); return filter ? l.filter(filter) : l; },
    // update(world => { … mutate … }, 'texto para la bitácora') — the function gets a copy; the result is saved and every document is told.
    update: function (fn, label) {
      var s = clone(fresh());
      var r = fn(s.world);
      if (r && r !== s.world && typeof r === 'object') s.world = r;
      write(s, { type: 'state', label: label || null });
      return clone(s.world);
    },
    subscribe: function (fn) { return WB.subscribe(function (ev) { if (ev.type === 'state' || ev.type === 'external' || ev.type === 'reset') fn(ev); }); },
    // apply a patch: [{op:'add', col, item} | {op:'set', col, id, fields} | {op:'remove', col, id} | {op:'settings', fields} | {op:'ext', lane, fields}]
    patch: function (ops, label) {
      var now = WB.clock.now().getTime();
      return WB.state.update(function (w) { applyOps(w, ops, now); }, label);
    },
    scenario: function () { return read().scenario; }
  };
  // relative times and days, in a scenario item or a patch
  function fixTimes(o, now) {
    TIME_FIELDS.forEach(function (k) { if (own(o, k) && o[k] != null) o[k] = when(o[k], now); });
    DAY_FIELDS.forEach(function (k) { if (own(o, k) && o[k] != null && !/^\d{4}-\d{2}-\d{2}$/.test(o[k])) o[k] = localParts(new Date(when(o[k], now))).date; });
  }
  function applyOps(w, ops, now) {
    (ops || []).forEach(function (op) {
      if (op.op === 'settings') { Object.assign(w.settings, op.fields || {}); return; }
      if (op.op === 'ext') { w.ext[op.lane] = Object.assign({}, w.ext[op.lane] || {}, op.fields || {}); return; }
      var list = w[op.col]; if (!list) throw new Error('WB.patch: unknown collection ' + op.col);
      var i = list.findIndex(function (x) { return x.id === (op.id || (op.item && op.item.id)); });
      if (op.op === 'add') {
        var it = clone(op.item);
        fixTimes(it, now);
        if (i >= 0) list[i] = it; else list.push(it);
      } else if (op.op === 'set') {
        if (i < 0) throw new Error('WB.patch: no ' + op.col + ' «' + op.id + '»');
        var f = clone(op.fields);
        fixTimes(f, now);
        Object.assign(list[i], f);
      } else if (op.op === 'remove') { if (i >= 0) list.splice(i, 1); }
      else throw new Error('WB.patch: unknown op ' + op.op);
    });
  }

  // Start over from a scenario (the current one by default). Keeps the visitor's theme.
  WB.reset = function (scenarioId) {
    var s = seed(scenarioId || (read() && read().scenario) || WB.index.defaultScenario);
    write(s, { type: 'reset' });
    return s.scenario;
  };
  WB.scenario = {
    current: function () { return read().scenario; },
    list: function () { var a = (WB.index && WB.index.scenarios) || {}; return Object.keys(a).map(function (k) { return { id: k, title: a[k].title, lane: a[k].lane, hidden: !!a[k].hidden }; }); },
    load: function (id) { return WB.reset(id); }
  };

  /* ---------- ctx (visitor controls) ---------- */
  function ctx() { return read().ctx; }
  function setCtx(fn, type) { var s = clone(fresh()); fn(s.ctx); write(s, { type: type || 'ctx' }); }

  /* ==========================================================================
     WB.clock — simulated time. Only moves forward. Streaks, auto-approvals and reminders follow it.
     ========================================================================== */
  var advanceHandlers = [];
  WB.clock = {
    now: function () { var c = ctx().clock; return new Date(Date.parse(c.start) + c.offsetMs); },
    iso: function () { return WB.clock.now().toISOString(); },
    // advance('1h' | '24h' | '1d' | ms). '1d' = the next day at 09:00 (Mexico City), so a new day of chores shows.
    advance: function (by) {
      var from = WB.clock.now().getTime(), to;
      if (typeof by === 'number') to = from + by;
      else if (by === '1h') to = from + HOUR;
      else if (by === '24h') to = from + DAY;
      else if (by === '1d') to = Date.parse(localParts(new Date(from + DAY)).date + 'T09:00:00' + TZ_OFFSET);
      else { var m = /^(\d+)([mhd])$/.exec(String(by)); if (!m) throw new Error('WB.clock.advance: bad step ' + by); to = from + Number(m[1]) * { m: 60e3, h: HOUR, d: DAY }[m[2]]; }
      if (to <= from) return WB.clock.now();
      setCtx(function (c) { c.clock.offsetMs += to - from; }, 'clock');
      // automations run once, in the host document (the shell, or a page opened alone): never twice
      if (WB.isHost) advanceHandlers.forEach(function (h) {
        try { h.fn({ from: new Date(from), to: new Date(to) }); } catch (e) { console.error('[WB] automation ' + h.id + ':', e); }
      });
      return WB.clock.now();
    },
    // onAdvance('chores:auto-approve', ({from, to}) => WB.state.update(…)) — runs only in the host document.
    onAdvance: function (id, fn) { advanceHandlers = advanceHandlers.filter(function (h) { return h.id !== id; }); advanceHandlers.push({ id: id, fn: fn }); },
    format: function (d, opts) {
      d = d || WB.clock.now();
      return new Intl.DateTimeFormat((opts && opts.locale) || 'es-MX', Object.assign({ timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }, opts || {})).format(new Date(d));
    },
    // the local day (Mexico City) of a time, 'YYYY-MM-DD' — today by default; day(-1) is yesterday
    day: function (d) {
      if (typeof d === 'number') return localParts(new Date(WB.clock.now().getTime() + d * DAY)).date;
      return localParts(d ? new Date(d) : WB.clock.now()).date;
    },
    // 0 (Sunday) … 6 (Saturday) of a local day 'YYYY-MM-DD'
    weekday: function (day) { return new Date(day + 'T12:00:00' + TZ_OFFSET).getUTCDay(); },
    tz: TZ
  };
  function localParts(d) {
    var p = {}; new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    return { date: p.year + '-' + p.month + '-' + p.day, time: p.hour + ':' + p.minute };
  }

  /* ==========================================================================
     WB.session — the visitor's one session in the app
     ========================================================================== */
  WB.session = {
    get: function () { return clone(ctx().session); },
    signIn: function (personId) {
      setCtx(function (c) {
        c.session = { signedIn: true, person: personId || c.viewAs.person, since: WB.clock.iso() };
        if (personId) c.viewAs.person = personId;
      }, 'session');
    },
    signOut: function () { setCtx(function (c) { c.session = { signedIn: false, person: c.session.person, since: null }; }, 'session'); }
  };

  /* ==========================================================================
     WB.viewAs — «Ver como»: the family member the visitor sees the app as. An adult sees the parent mode, a kid the
     kid mode (definicion «Una sola app con dos modos»).
     ========================================================================== */
  WB.viewAs = {
    get: function () { return clone(ctx().viewAs); },
    person: function () { return WB.state.get('people', ctx().viewAs.person); },
    set: function (personId) {
      setCtx(function (c) { c.viewAs.person = personId; if (c.session.signedIn) c.session.person = personId; }, 'viewAs');
    },
    role: function () { return WB.role(ctx().viewAs.person); }
  };

  // The kid the screen is about: its ?kid= param, else the «Ver como» person when they are a kid.
  var screenCtx = null;
  WB.setScreenContext = function (c) { screenCtx = c || null; emit({ type: 'screen' }); };
  WB.context = function () {
    if (screenCtx) return clone(screenCtx);
    if (WB.params && WB.params.kid) return { kid: WB.params.kid };
    var p = WB.viewAs.person();
    return p && p.role === 'kid' ? { kid: p.id } : null;
  };

  /* ==========================================================================
     Roles and permissions: people[].role is 'adult' or 'kid' (familia R2: both adults have the same permissions).
     A lane may replace them through WB.provide.
     ========================================================================== */
  var ROLE_NAMES = { adult: 'Adulto', kid: 'Hijo' };
  WB.roleName = function (role, personId) {
    if (!role) return 'Sin acceso';
    var p = personId ? (read().world.people || []).find(function (x) { return x.id === personId; }) : null;
    if (p && p.label) return p.label;   // «Papá», «Mamá»
    if (role === 'kid' && p && p.wordForm === 'feminine') return 'Hija';
    return ROLE_NAMES[role] || role;
  };

  var providers = {}, providerLane = {};
  WB.provide = function (name, fn, lane) {
    if (['role', 'can'].indexOf(name) < 0) throw new Error('WB.provide: unknown hook ' + name);
    if (providers[name] && providerLane[name] !== lane) warn(name + ' was provided by ' + providerLane[name] + '; ' + (lane || 'a page') + ' replaces it');
    providers[name] = fn; providerLane[name] = lane || null;
  };
  WB.providedBy = function (name) { return providerLane[name] || 'shell (por omisión)'; };

  function defaultRole(personId) {
    var p = (read().world.people || []).find(function (x) { return x.id === personId && !x.removedAt; });
    return p ? p.role : null;
  }
  WB.role = function (personId, target) { return (providers.role || defaultRole)(personId, target || null); };

  /* The verbs (GLOSSARY.md): an adult does everything of familia R2; a kid marks their own chores and redeems their
     own prizes (tareas R6, huevos R8). */
  var ADULT = ['view', 'chore.create', 'chore.edit', 'chore.mark', 'approve', 'forgive', 'pause', 'lovi', 'prize.create', 'prize.deliver', 'goal.create', 'kid.create', 'pair'];
  var KID = ['view', 'chore.mark', 'prize.redeem'];
  function defaultCan(verb, target, c) {
    var role = WB.role(c.person, target);
    if (!role) return { allowed: false, role: null, code: 'no-access', reason: 'No es de esta familia.' };
    var list = role === 'adult' ? ADULT : KID;
    if (list.indexOf(verb) < 0) return { allowed: false, role: role, code: 'role', reason: role === 'kid' ? 'Eso lo hace un adulto.' : 'Eso lo hace el hijo.' };
    if (role === 'kid' && target && target.kid && target.kid !== c.person) return { allowed: false, role: role, code: 'other-kid', reason: 'Solo lo tuyo.' };
    return { allowed: true, role: role, code: null, reason: null };
  }
  // WB.can('approve') → true | false, for the «Ver como» person. WB.can.detail(…) → { allowed, role, code, reason }.
  WB.can = function (verb, target) { return WB.can.detail(verb, target).allowed; };
  WB.can.detail = function (verb, target, personId) {
    var c = { person: personId || ctx().viewAs.person, now: WB.clock.now() };
    target = target || WB.context();
    var r = (providers.can || defaultCan)(verb, target, c);
    if (typeof r === 'boolean') r = { allowed: r, role: WB.role(c.person, target), reason: null };
    return r;
  };

  /* every configuration change records who and when (decided by the founder) */
  WB.audit = function (what, target, details) {
    WB.state.update(function (w) { (w.audit = w.audit || []).push({ at: WB.clock.iso(), by: ctx().viewAs.person, what: what, target: target || null, details: details || null }); }, null);
  };

  /* ==========================================================================
     Theme — «Tema»: auto · light · dark. sim.js sets <html data-theme> in every document (tokens.css reads it).
     ========================================================================== */
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  WB.theme = {
    pref: function () { var s = read(); return (s && s.ctx.theme) || 'auto'; },
    get: function () { var p = WB.theme.pref(); return p === 'auto' ? (mq && mq.matches ? 'dark' : 'light') : p; },
    set: function (pref) { setCtx(function (c) { c.theme = pref; }, 'theme'); applyTheme(); }
  };
  function applyTheme() { if (document.documentElement) document.documentElement.setAttribute('data-theme', WB.theme.get()); }
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { applyTheme(); emit({ type: 'theme' }); });

  /* ==========================================================================
     Navigation, params and the screen being shown
     ========================================================================== */
  function parseParams(search) { var o = {}; new URLSearchParams(search).forEach(function (v, k) { o[k] = v; }); return o; }
  WB.params = parseParams(location.search);

  function screenDef(id) { return (WB.index && WB.index.screens && WB.index.screens[id]) || null; }
  WB.screens = function () { return clone((WB.index && WB.index.screens) || {}); };
  // URL of a screen: WB.href('app.kid', {kid: 'p-sofia'})
  WB.href = function (id, params) {
    var d = screenDef(id);
    var u = new URL(d ? d.file : 'simulator/screens/missing.html', ROOT);
    if (!d) u.searchParams.set('id', id);
    Object.keys(params || {}).forEach(function (k) { if (params[k] != null) u.searchParams.set(k, params[k]); });
    return u.pathname + u.search;
  };
  // Go to a screen by id. Inside the shell the shell navigates (and keeps the frame).
  WB.go = function (id, params) {
    if (still) return;
    if (host && host.go) return host.go(id, params || {});
    if (window.WBShell && window.WBShell.go) return window.WBShell.go(id, params || {});   // called from the shell page itself
    location.href = WB.href(id, params);
  };
  // go by a prototype's file name ('wirebit-pin.html?paso=bloqueo'), through the catalog's files and aliases
  WB.goFile = function (href) {
    var u = new URL(href, location.href), name = u.pathname.split('/').pop(), id = WB.screenForFile(name);
    if (!id) { location.href = href; return; }
    WB.go(id, parseParams(u.search));
  };
  // file names compare without «.html»: a host with pretty URLs (Cloudflare Pages) serves «pin.html» as «pin»
  var bare = function (n) { return String(n || '').replace(/\.html$/, ''); };
  WB.screenForFile = function (name) {
    var all = (WB.index && WB.index.screens) || {}; name = bare(name);
    var hit = Object.keys(all).filter(function (k) { var s = all[k]; return bare(s.file.split('/').pop()) === name || (s.aliases || []).map(bare).indexOf(name) >= 0; });
    return hit.length ? hit.sort(function (a, b) { return (all[a].provisional ? 1 : 0) - (all[b].provisional ? 1 : 0); })[0] : null;
  };
  WB.screenForPath = function (pathname) {
    var all = (WB.index && WB.index.screens) || {}, p = bare(pathname);
    return Object.keys(all).find(function (k) { return bare(new URL(all[k].file, ROOT).pathname) === p; }) || WB.screenForFile(pathname.split('/').pop());
  };
  // back to the screen before; with nothing before it (opened by link, or a fresh tab) to `fallback` (a screen id), else the default
  WB.back = function (fallback) { if (still) return; if (host && host.back) return host.back(fallback); if (history.length > 1 || !fallback) history.back(); else WB.go(fallback); };

  var here = { screen: null, state: null };
  /* ==========================================================================
     WB.flow — every operation returns to where it started (Addition 18, founder: «asegúrate que todos los flujos tengan
     coherencia y sentido»). An operation remembers its origin (the screen it was started from, with its params); inside
     it «back» goes one step; when it finishes its steps leave the history and «Listo» or back go straight to the origin;
     «Cancelar» returns in one tap. Kept per tab (sessionStorage), a small stack so an operation inside another (reset
     inside sign-in) comes back to it.
       WB.flow.start(name, { from?, fallback? })   on the operation's first screen: the origin is the screen before it,
                                                  else from, else fallback (a deep link: the sensible parent)
       WB.flow.step(id, { screen?, params? })     a step; with a screen it opens it (back comes back to this one)
       WB.flow.back()                              one step back → the step id to show; on the first step: cancel()
       WB.flow.finish(result, { screen?, params?, origin? })   done (result, sent to approval, held, failed): the steps
                                                  leave the history; with a screen the result opens there; origin:
                                                  'replace' — the end takes the origin's place; origin: 'clear' — the
                                                  end starts a new history (entering the app: nothing of the access
                                                  is behind Inicio, as a phone app after signing in)
       WB.flow.exit()                              «Listo», or back on a finished operation: the origin, in one tap
       WB.flow.leave(screen, params)               from a result to another screen («Ver movimiento»): the operation
                                                  leaves the history, so back from there is the origin (sense U-2)
       WB.flow.cancel()                            the same, unfinished (confirm first only if data would be lost)
       WB.flow.current() · WB.flow.origin()        the operation in course and its origin, or null
     A screen the person reaches that is a finished operation's origin settles it by itself (a prototype that navigates
     back on its own, like the reset's «Contraseña actualizada» → sign-in).
     ========================================================================== */
  var FLOWS = 'cs-sim/flow', startedHere = {};   // startedHere: operations started by this page load
  function flowsGet() { try { return JSON.parse(sessionStorage.getItem(FLOWS)) || []; } catch (e) { return []; } }
  function flowsSet(l) { try { if (l && l.length) sessionStorage.setItem(FLOWS, JSON.stringify(l.slice(-5))); else sessionStorage.removeItem(FLOWS); } catch (e) {} }
  function routeParams(p) { var o = {}; Object.keys(p || {}).forEach(function (k) { if (k !== 'estado') o[k] = p[k]; }); return o; }
  function hereRoute() { return { id: here.screen, params: routeParams(WB.params) }; }
  function sameRoute(a, b) { return !!(a && b && a.id === b.id && JSON.stringify(routeParams(a.params)) === JSON.stringify(routeParams(b.params))); }
  function lastIndexOf(r, e) { var i; for (i = r.length - 1; i >= 0; i--) if (sameRoute(r[i], e)) return i; for (i = r.length - 1; i >= 0; i--) if (r[i].id === e.id) return i; return -1; }
  function hostRoutes() { return host && host.routes ? host.routes() || [] : []; }
  function setHostRoutes(r) { if (host && host.setRoutes) host.setRoutes(r); }
  // the shell's history without the operation's steps: what was before the origin (and the origin itself, if kept)
  function cutAt(f, keepOrigin) {
    var r = hostRoutes(), i = lastIndexOf(r, f.origin);
    if (i >= 0) return r.slice(0, keepOrigin ? i + 1 : i);
    return r.filter(function (e) { return f.screens.indexOf(e.id) < 0; }).concat(keepOrigin ? [f.origin] : []);
  }
  function replaceTo(route) {
    if (host && host.open) return host.open(route.id, route.params || {}, { replace: true });
    location.replace(WB.href(route.id, route.params || {}));
  }
  function parentOf(o) {
    if (o && o.fallback) return { id: o.fallback.id || o.fallback.screen, params: o.fallback.params || {} };
    return { id: WB.role(ctx().viewAs.person) === 'kid' ? 'app.kid' : 'app.today', params: {} };
  }
  WB.flow = {
    start: function (name, o) {
      o = o || {};
      var stack = flowsGet(), top = stack[stack.length - 1], cur = hereRoute(), r = hostRoutes(), prev = null, i;
      // called again on the same page (a re-render): the operation already running here
      if (top && startedHere[name] && top.name === name && top.screens.indexOf(cur.id) >= 0) return clone(top);
      for (i = r.length - 1; i >= 0; i--) if (r[i].id !== cur.id) { prev = r[i]; break; }
      // the same operation, on its next screen: it keeps its origin. Only from inside it — the same screen reached from
      // elsewhere is a new operation with its own origin (a later operation started from another screen went back
      // to the old one); a reload starts again from the same origin, which is the screen before
      if (top && top.name === name && !top.finished && prev && prev.id !== cur.id && top.screens.indexOf(prev.id) >= 0) {
        if (top.screens.indexOf(cur.id) < 0) { top.screens.push(cur.id); flowsSet(stack); }
        startedHere[name] = true;
        return clone(top);
      }
      var origin = o.from ? { id: o.from.id || o.from.screen, params: o.from.params || {} } : prev ? { id: prev.id, params: routeParams(prev.params) } : parentOf(o);
      // an operation started from inside another (reset from sign-in) stacks on it; anything else starts afresh
      if (!(top && !top.finished && top.screens.indexOf(origin.id) >= 0)) stack = [];
      var f = { name: name, origin: origin, screens: [cur.id], steps: [], finished: false, result: null, at: WB.clock.iso() };
      stack.push(f); flowsSet(stack); startedHere[name] = true;
      return clone(f);
    },
    step: function (id, o) {
      o = o || {}; var stack = flowsGet(), f = stack[stack.length - 1]; if (!f) return null;
      var last = f.steps[f.steps.length - 1];
      if (!last || last.id !== id) f.steps.push({ id: id, screen: o.screen || here.screen, params: o.screen ? (o.params || {}) : routeParams(WB.params) });
      if (o.screen && f.screens.indexOf(o.screen) < 0) f.screens.push(o.screen);
      flowsSet(stack);
      if (o.screen && o.screen !== here.screen) WB.go(o.screen, o.params || {});
      return id;
    },
    back: function () {
      var stack = flowsGet(), f = stack[stack.length - 1];
      if (!f || f.screens.indexOf(here.screen) < 0) { WB.back(); return null; }
      if (f.finished) { WB.flow.exit(); return null; }
      if (f.steps.length <= 1) { WB.flow.cancel(); return null; }
      f.steps.pop(); var prev = f.steps[f.steps.length - 1]; flowsSet(stack);
      if (prev.screen && prev.screen !== here.screen) {   // the step before is another screen: this one leaves the history
        setHostRoutes(hostRoutes().filter(function (e, k, all) { return k < all.length - 1 || e.id !== here.screen; }));
        replaceTo({ id: prev.screen, params: prev.params });
      }
      return prev.id;
    },
    finish: function (result, o) {
      o = o || {}; var stack = flowsGet(), f = stack[stack.length - 1]; if (!f) return null;
      f.finished = true; f.result = result || 'listo';
      if ((o.origin === 'replace' || o.origin === 'clear') && o.screen) {   // the end takes the origin's place: nothing of the operation stays behind
        stack.pop(); flowsSet(o.origin === 'clear' ? [] : stack);
        setHostRoutes(o.origin === 'clear' ? [] : cutAt(f, false));
        replaceTo({ id: o.screen, params: o.params || {} });
        return clone(f);
      }
      if (o.screen && f.screens.indexOf(o.screen) < 0) f.screens.push(o.screen);
      flowsSet(stack);
      var r = cutAt(f, true);
      if (o.screen) { setHostRoutes(r); replaceTo({ id: o.screen, params: o.params || {} }); }
      else setHostRoutes(r.concat(sameRoute(r[r.length - 1], hereRoute()) ? [] : [hereRoute()]));   // origin, then the result shown here
      return clone(f);
    },
    exit: function () {
      var stack = flowsGet(), f = stack.pop();
      if (!f) { WB.back(); return; }
      flowsSet(stack);
      setHostRoutes(cutAt(f, false));
      replaceTo(f.origin);
    },
    cancel: function () { WB.flow.exit(); },
    leave: function (screen, params) {
      var stack = flowsGet(), f = stack.pop();
      if (!f) { WB.go(screen, params || {}); return; }
      flowsSet(stack);
      setHostRoutes(cutAt(f, true));   // the origin stays; the operation's screens go
      replaceTo({ id: screen, params: params || {} });
    },
    current: function () { var s = flowsGet(); return s.length ? clone(s[s.length - 1]) : null; },
    origin: function () { var f = WB.flow.current(); return f ? clone(f.origin) : null; }
  };
  // a finished operation's origin, reached by the screen's own navigation: settle it (its steps leave the history)
  function flowSettle() {
    var stack = flowsGet(), f = stack[stack.length - 1];
    if (!f || !f.finished || !here.screen || here.screen !== f.origin.id) return;
    stack.pop(); flowsSet(stack);
    setHostRoutes(cutAt(f, true));
  }

  // the screen id of this document: <meta name="wb-screen" content="app.pin">, else from the catalog by file
  function detectScreen() {
    var m = document.querySelector('meta[name="wb-screen"]');
    if (m) return m.content;
    return WB.screenForPath(location.pathname);
  }
  // A screen says which designed state it shows (catalog «states»). Tests and the console read it (WB.here()).
  WB.setScreenState = function (state) {
    if (here.state === state) return;
    here.state = state;
    emit({ type: 'screen', screen: here.screen, state: state });
  };
  WB.here = function () { return { screen: here.screen, state: here.state || WB.params.estado || 'default', params: clone(WB.params) }; };

  // designed states a page opens on request (?estado=…): WB.onState('bloqueada', () => …). Called after the page loaded.
  var stateHandlers = {};
  WB.onState = function (state, fn) { stateHandlers[state] = fn; };

  /* Wiring kept apart from the look (Addition 3): a lane's logic file says what a screen does —
       WB.wire('app.pin', function (WB, doc) { … data-od-id, WB.setScreenState, WB.go … });
     It runs in that screen's document once its HTML and its own scripts are in (DOMContentLoaded), before ?estado= handlers.
     A designer's screen can then replace the HTML without touching the logic. */
  var wires = {};
  WB.wire = function (screenId, fn) { (wires[screenId] = wires[screenId] || []).push(fn); };

  /* ==========================================================================
     WB.ui.stateScreen(host, opts) — the one full-screen state of the simulator: «sin acceso», «no existe», «vacío» and
     «error», app and business web. The canon's StateSheet look (product/pantallas/retail/avisos.md, wirebit-alerts.html):
     an icon in a disc with its glow, a title whose last word carries the brand blue, one sentence that says what to do,
     a filled primary button and an optional secondary. The type sets the colour, the case sets the icon.
       opts = { kind: 'no-access' | 'not-found' | 'empty' | 'error', title, text,
                primary: { label, go?, params?, onClick? }, secondary?: { label, go?, params?, onClick? },
                icon?: 'lock' | 'search' | 'inbox' | 'alert' | 'plus' | 'refresh', tone?: 'warning' | 'info' | 'brand' | 'error' | 'success',
                id?: the data-od-id prefix (default 'state'), compact?: true inside a panel instead of a whole screen }
       → the element; the host's content is replaced (call it again to change it). Copy: Mexican Spanish; a title of
       2–6 words, one sentence ≤ 65 characters, buttons of 2–4 words (avisos ficha).
     ========================================================================== */
  var STATE_KINDS = { 'no-access': { tone: 'warning', icon: 'lock' }, 'not-found': { tone: 'info', icon: 'search' }, empty: { tone: 'brand', icon: 'inbox' }, error: { tone: 'error', icon: 'alert' } };
  var STATE_ICONS = {
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.6v2.2"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.4 15.4 5.1 5.1M8.4 8.4l4.2 4.2m0-4.2-4.2 4.2"/>',
    inbox: '<path d="M3.5 13.5 6.4 5.5h11.2l2.9 8V19h-17z"/><path d="M3.5 13.5h5a3.5 3.5 0 0 0 7 0h5"/>',
    alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.6v5.4M12 16.3v.1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9"/><path d="M19.5 4v5h-5"/>'
  };
  // the StateSheet's colours by type (avisos ficha «Colores por tipo»): light — disc 50, glyph 700, glow 700 at 14 %;
  // dark — disc 700 (warning 650) with a white glyph, glow 300 at 22 % (warning #ffd21a); brand — blue 600, white glyph
  var STATE_CSS = '.wb-state{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;box-sizing:border-box;min-height:100%;width:100%;padding:56px 24px 40px;font-family:var(--cs-font-text,"Plus Jakarta Sans",system-ui,sans-serif);color:var(--cs-text,#1A1F33);overflow-x:clip;overflow-y:visible}'
    + '.wb-state.compact{min-height:0;padding:40px 16px 32px}'
    + '.wb-state-disc{position:relative;width:104px;height:104px;border-radius:9999px;display:grid;place-items:center;margin:0 0 32px;isolation:isolate;background:var(--st-disc);color:var(--st-glyph)}'
    + '.wb-state-disc::before{content:"";position:absolute;inset:-84px;border-radius:9999px;z-index:-1;background:radial-gradient(circle,var(--st-glow) 0%,transparent 68%)}'
    + '.wb-state-disc svg{width:48px;height:48px}'
    + '.wb-state-title{font-family:var(--cs-font-display,Outfit,system-ui,sans-serif);margin:0 0 10px;max-width:300px;font-size:28px;line-height:36px;font-weight:600;letter-spacing:-.01em;text-wrap:balance}'
    + '.wb-state-title em{font-style:normal;color:var(--cs-streak,#D9921F)}'
    + '.wb-state-text{margin:0 0 40px;max-width:300px;font-size:15px;line-height:22px;color:var(--cs-text-soft,#4F5670)}'
    + '.wb-state-acts{display:flex;flex-direction:column;gap:8px;width:100%;max-width:320px}'
    + '.wb-state-acts button{min-height:52px;padding:0 24px;border:0;border-radius:9999px;font-family:inherit;font-size:16px;font-weight:600;cursor:pointer}'
    + '.wb-state-acts .wb-state-primary{background:var(--cs-action-bg,#2A3048);color:var(--cs-action-text,#fff)}'
    + '.wb-state-acts .wb-state-secondary{background:transparent;color:var(--cs-text,#1A1F33)}'
    + '.wb-state-acts button:focus-visible{outline:2px solid var(--cs-wait,#2A5F95);outline-offset:3px}'
    + '.wb-state[data-tone=error]{--st-disc:var(--wb-error-50,#fff2f0);--st-glyph:var(--wb-error-700,#8b010b);--st-glow:rgba(139,1,11,.14)}'
    + '.wb-state[data-tone=warning]{--st-disc:var(--wb-warning-50,#fefce8);--st-glyph:var(--wb-warning-700,#a16207);--st-glow:rgba(161,98,7,.14)}'
    + '.wb-state[data-tone=info]{--st-disc:var(--wb-violet-50,#f5f0ff);--st-glyph:var(--wb-violet-700,#5e1fbd);--st-glow:rgba(94,31,189,.14)}'
    + '.wb-state[data-tone=success]{--st-disc:var(--wb-success-50,#e9fbe9);--st-glyph:var(--wb-success-700,#005813);--st-glow:rgba(0,88,19,.14)}'
    + '.wb-state[data-tone=brand]{--st-disc:var(--cs-egg,#E8A92B);--st-glyph:#1A1F33;--st-glow:rgba(72,104,250,.16)}'
    + '[data-theme=dark] .wb-state[data-tone=error]{--st-disc:var(--wb-error-700,#8b010b);--st-glyph:#fff;--st-glow:rgba(255,161,150,.22)}'
    + '[data-theme=dark] .wb-state[data-tone=warning]{--st-disc:var(--wb-warning-650,#b67606);--st-glyph:#fff;--st-glow:rgba(255,210,26,.22)}'
    + '[data-theme=dark] .wb-state[data-tone=info]{--st-disc:var(--wb-violet-700,#5e1fbd);--st-glyph:#fff;--st-glow:rgba(201,174,250,.22)}'
    + '[data-theme=dark] .wb-state[data-tone=success]{--st-disc:var(--wb-success-700,#005813);--st-glyph:#fff;--st-glow:rgba(123,215,127,.22)}'
    + '[data-theme=dark] .wb-state[data-tone=brand]{--st-glow:rgba(72,104,250,.24)}'
    + '[data-theme=dark] .wb-state{color:var(--cs-text,#F5EEDF)}'
    + '[data-theme=dark] .wb-state-text{color:var(--cs-text-soft,#B9B3C9)}'
    + '[data-theme=dark] .wb-state-acts .wb-state-secondary{color:var(--cs-text,#F5EEDF)}'
    + '@media (prefers-reduced-motion:no-preference){.wb-state-disc{animation:wb-state-pop .15s cubic-bezier(.2,0,0,1)}}'
    + '@keyframes wb-state-pop{0%{transform:scale(.92)}60%{transform:scale(1.06)}100%{transform:scale(1)}}';
  WB.ui = {
    stateScreen: function (host, o) {
      if (!host || !o) return null;
      var d = host.ownerDocument, k = STATE_KINDS[o.kind] || STATE_KINDS.error, id = o.id || 'state';
      if (!d.getElementById('wb-state-css')) { var st = d.createElement('style'); st.id = 'wb-state-css'; st.textContent = STATE_CSS; (d.head || d.documentElement).appendChild(st); }
      var el = d.createElement('section');
      el.className = 'wb-state' + (o.compact ? ' compact' : ''); el.setAttribute('data-tone', o.tone || k.tone); el.setAttribute('data-kind', o.kind || 'error');
      el.setAttribute('data-od-id', id); el.setAttribute('role', o.kind === 'error' ? 'alert' : 'status');
      var icon = STATE_ICONS[o.icon] || STATE_ICONS[k.icon];
      el.innerHTML = '<div class="wb-state-disc" data-od-id="' + id + '-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + icon + '</svg></div>'
        + '<h2 class="wb-state-title" data-od-id="' + id + '-title"></h2><p class="wb-state-text" data-od-id="' + id + '-text"></p><div class="wb-state-acts"></div>';
      // the title's last word carries the brand blue (avisos ficha: «la última palabra acentuada»)
      var t = String(o.title || ''), cut = t.trim().lastIndexOf(' '), h = el.querySelector('.wb-state-title');
      if (cut > 0) { h.appendChild(d.createTextNode(t.slice(0, cut + 1))); var em = d.createElement('em'); em.textContent = t.slice(cut + 1); h.appendChild(em); } else h.textContent = t;
      var p = el.querySelector('.wb-state-text'); if (o.text) p.textContent = o.text; else p.remove();
      var acts = el.querySelector('.wb-state-acts');
      [['primary', o.primary], ['secondary', o.secondary]].forEach(function (b) {
        if (!b[1] || !b[1].label) return;
        var btn = d.createElement('button'); btn.type = 'button'; btn.className = 'wb-state-' + b[0]; btn.textContent = b[1].label; btn.setAttribute('data-od-id', id + '-' + b[0]);
        btn.addEventListener('click', function () { if (b[1].onClick) b[1].onClick(); else if (b[1].go) WB.go(b[1].go, b[1].params || {}); });
        acts.appendChild(btn);
      });
      if (!acts.children.length) acts.remove();
      host.innerHTML = ''; host.appendChild(el);
      return el;
    }
  };
  /* ==========================================================================
     Boot: index → lane logic → store → ready
     ========================================================================== */
  var readyFns = [], booted = false;
  WB.ready = function (fn) { if (booted) { try { fn(WB); } catch (e) { console.error(e); } } else readyFns.push(fn); };

  WB.__boot = function () {
    if (booted) return;
    WB.index = window.WB_INDEX || null;
    if (!WB.index) { console.error('[WB] simulator/generated/index.js is missing: run node simulator/tools/build-screens.mjs'); return; }
    try { read(); } catch (e) { console.error('[WB] the scenario could not be seeded:', e); lsSet(KEY, null); cache = null; }
    here.screen = detectScreen();
    applyTheme();
    flowSettle();
    booted = true;
    readyFns.splice(0).forEach(function (fn) { try { fn(WB); } catch (e) { console.error(e); } });
    var wire = function () {
      (wires[here.screen] || []).forEach(function (fn) { try { fn(WB, document); } catch (e) { console.error('[WB] wiring of ' + here.screen + ':', e); } });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
    var run = function () {
      var st = WB.params.estado;
      if (st && stateHandlers[st]) { try { stateHandlers[st](WB); } catch (e) { console.error(e); } }
    };
    if (document.readyState === 'complete') setTimeout(run, 0); else window.addEventListener('load', function () { setTimeout(run, 0); });
  };
  WB.__afterIndex = function () {
    var idx = window.WB_INDEX, files = (idx && idx.logic) || [];
    if (writing) {
      files.forEach(function (f) { document.write('<script src="' + new URL(f, ROOT).pathname + '"><\/script>'); });
      document.write('<script>WB.__boot()<\/script>');
    } else {
      files.reduce(function (p, f) { return p.then(function () { return load(new URL(f, ROOT).href); }); }, Promise.resolve()).then(WB.__boot, WB.__boot);
    }
  };
  function load(src) { return new Promise(function (res) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { console.error('[WB] could not load ' + src); res(); }; document.head.appendChild(s); }); }

  // parser-inserted (the contract's way): document.write keeps the order before the page's own scripts
  var writing = document.readyState === 'loading' && !!script && !script.async && !script.defer;
  if (window.WB_INDEX) WB.__afterIndex();
  else if (writing) {
    document.write('<script src="' + new URL('generated/index.js', BASE).pathname + '"><\/script>');
    document.write('<script>WB.__afterIndex()<\/script>');
  } else load(new URL('generated/index.js', BASE).href).then(WB.__afterIndex);
})();
