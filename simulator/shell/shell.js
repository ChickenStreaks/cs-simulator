/* ==========================================================================
   The simulator's «Use the app» (app.html; the doors are index.html, the gallery gallery.html): the device frame
   (iPhone 15, Android) and the bar (the name and
   «See as [Parent | Kids]»). Everything else — the clock, a scenario, start over, the theme — is done from the console
   through WB (sim.js). The screen runs in a same-origin iframe; both read the one WB state. window.WBShell is the
   bridge the screen's sim.js talks to (go, back, routes).
   ========================================================================== */
(function () {
  'use strict';
  var WB = window.WB;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function ssGet(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } }
  function ssSet(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var PREFS = 'wb-shell/v1';
  var prefs = Object.assign({ device: 'iphone15', area: 'app', lastApp: null, lastBiz: null }, lsGet(PREFS) || {});
  function savePrefs() { lsSet(PREFS, prefs); }

  var bar = $('#sh-bar'), stage = $('#sh-stage'), caption = $('#sh-caption'), device = $('#sh-device'), screenBox = $('#sh-screen'),
    frame = $('#sh-frame'), live = $('#sh-live'), chrome = $('#sh-chrome');
  var current = { id: null, params: {} };   // what the frame shows

  var GRID = '<svg class="sh-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg>';
  var RESET = '<svg class="sh-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4v6h6"/><path d="M5.5 15a7 7 0 1 0 1.6-7.3L4 10"/></svg>';

  /* ==========================================================================
     The frame
     ========================================================================== */
  // the app's devices: two phones (Pixel 8 in CSS px), portrait
  var DEVICES = { iphone15: { w: 390, h: 844, pad: 12 }, android: { w: 412, h: 915, pad: 10 }, desk: { w: 1280, h: 800 } };
  var PHONES = [['iphone15', 'iPhone 15'], ['android', 'Android']];
  if (!DEVICES[prefs.device] || prefs.device === 'desk') prefs.device = 'iphone15';   // a device that was removed (iPhone SE, the tablets) falls back
  function screenDef(id) { return (WB.index.screens || {})[id] || null; }
  function areaOf(id) { var d = screenDef(id); return d ? d.area : (/^biz\./.test(id || '') ? 'biz' : 'app'); }
  function isPhoneVisitor() { return window.innerWidth < 640; }
  function layout() {
    var area = areaOf(current.id) === 'biz' ? 'biz' : 'app';
    var dev = area === 'biz' ? DEVICES.desk : DEVICES[prefs.device] || DEVICES.iphone15;
    var full = area === 'app' && isPhoneVisitor();
    document.body.classList.toggle('sh-full', full);
    device.className = 'sh-device ' + (area === 'biz' ? 'desk' : 'phone ' + prefs.device);
    chrome.hidden = area !== 'biz';
    if (full) { screenBox.style.width = ''; screenBox.style.height = Math.max(stage.clientHeight, DEVICES.iphone15.h) + 'px'; device.style.transform = ''; device.style.marginBottom = ''; return; }   // a phone visitor: the screen keeps its designed height and the page scrolls
    screenBox.style.width = dev.w + 'px'; screenBox.style.height = dev.h + 'px';
    var outerW = dev.w + 2 * (dev.pad || 0), outerH = dev.h + 2 * (dev.pad || 0) + (area === 'biz' ? 30 : 0);
    var availW = stage.clientWidth - 32, availH = window.innerHeight - bar.offsetHeight - caption.offsetHeight - 52;
    var s = Math.min(1, availW / outerW, area === 'biz' ? Math.max(availH, 480) / outerH : Math.max(availH, 420) / outerH);
    device.style.transformOrigin = 'top center';
    device.style.transform = s < 1 ? 'scale(' + s.toFixed(4) + ')' : '';
    device.style.marginBottom = s < 1 ? (-(outerH * (1 - s))) + 'px' : '';
    var fw = frame.contentWindow;
    try { if (fw && fw.document && fw.document.documentElement) fw.document.documentElement.setAttribute('data-wb-device', area === 'biz' ? 'desktop' : prefs.device); } catch (e) {}
  }
  function fdoc() { try { return frame.contentDocument; } catch (e) { return null; } }

  /* Open Design prototypes (copied or as they are) draw their own review bar and phone bezel: in the frame, the screen
     fills the device and the review tools go away. Injected into any page with that structure. */
  var FIT_CSS = 'html,body{height:100%;overflow:hidden!important;background:transparent!important}'
    + '.stage{padding:0!important;min-height:0!important;height:100%!important;overflow:hidden!important}.stage::before{display:none!important}'
    + '.stage-bar,[data-proto-chrome]{display:none!important}'
    + '.frame-wrap,.phone{display:block!important;width:100%!important;height:100%!important;margin:0!important}'
    + '.bezel{width:100%!important;height:100%!important;padding:0!important;border:0!important;border-radius:0!important;background:none!important;box-shadow:none!important}'
    + '.screen{width:100%!important;height:100%!important;border-radius:0!important}'
    + 'html[data-wb-device]:not([data-wb-device="iphone15"]) .island{display:none!important}';   // only the iPhone has the island
  function dress(doc) {
    if (!doc || !doc.head) return;
    if (!doc.getElementById('wb-shell-css') && doc.querySelector('.stage .bezel .screen')) {
      var st = doc.createElement('style'); st.id = 'wb-shell-css'; st.textContent = FIT_CSS; doc.head.appendChild(st);
    }
    doc.documentElement.setAttribute('data-wb-device', areaOf(current.id) === 'biz' ? 'desktop' : prefs.device);
  }

  /* ---------- routing ---------- */
  function paramsOf(search) { var o = {}; new URLSearchParams(search).forEach(function (v, k) { o[k] = v; }); return o; }
  function hashOf(id, params) { var q = new URLSearchParams(params || {}).toString(); return '#' + id + (q ? '?' + q : ''); }
  function open(id, params, opts) {
    params = params || {}; opts = opts || {};
    current = { id: id, params: params };
    var url = WB.href(id, params);
    if (opts.state) url += (url.indexOf('?') < 0 ? '?' : '&') + 'estado=' + encodeURIComponent(opts.state);
    remember();
    layout(); renderCaption();
    if (opts.replace) { try { frame.contentWindow.location.replace(url); } catch (e) { frame.src = url; } }   // WB.flow: no history entry
    else frame.src = url;
  }
  function remember() {
    if (!current.id) return;
    var area = areaOf(current.id);
    if (area === 'biz') prefs.lastBiz = current; else prefs.lastApp = current;
    prefs.area = area; savePrefs();
    var h = hashOf(current.id, current.params);
    if (location.hash !== h) history.replaceState(null, '', location.pathname + location.search + h);
  }
  function defaultScreen(area) {
    if (area === 'biz') return (prefs.lastBiz && prefs.lastBiz.id) ? prefs.lastBiz : { id: 'biz.home', params: {} };
    if (prefs.lastApp && prefs.lastApp.id) return prefs.lastApp;
    return { id: 'app.splash', params: {} };   // the first visit opens the app as a family would: the splash
  }
  function reloadFrame() { try { frame.contentWindow.location.reload(); } catch (e) { frame.src = frame.src; } }

  frame.addEventListener('load', function () {
    var w = frame.contentWindow, loc;
    try { loc = w.location; } catch (e) { return; }
    if (!loc || loc.href === 'about:blank') return;
    var params = paramsOf(loc.search), missing = /\/simulator\/screens\/missing(\.html)?$/.test(loc.pathname);
    delete params.estado;
    var id = missing ? null : WB.screenForPath(loc.pathname);
    if (missing) { id = params.id || 'dev.missing'; params = {}; }
    current = { id: id || ('unknown:' + loc.pathname.split('/').pop()), params: params };
    remember(); pushRoute();
    dress(fdoc());
    layout(); renderCaption(); renderBar();
  });
  // the screens visited in this tab, for «Regresar» (WB.back) across reloads of the frame
  var ROUTES = 'wb-shell/routes';
  function pushRoute() {
    var r = ssGet(ROUTES) || [], top = r[r.length - 1];
    if (top && top.id === current.id && JSON.stringify(top.params) === JSON.stringify(current.params)) return;
    r.push({ id: current.id, params: current.params }); ssSet(ROUTES, r.slice(-30));
  }

  /* ==========================================================================
     The bridge the screen's sim.js uses
     ========================================================================== */
  window.WBShell = {
    go: function (id, params) { open(id, params || {}); },
    back: function (fallback) {
      var r = ssGet(ROUTES) || []; r.pop(); var prev = r.pop();
      while (prev && prev.id === current.id) prev = r.pop();   // the same screen twice (another state, other params) is not «before»
      ssSet(ROUTES, r);
      if (prev) open(prev.id, prev.params); else { var d = fallback ? { id: fallback, params: {} } : defaultScreen('app'); open(d.id, d.params); }
    },
    open: open,
    current: function () { return { id: current.id, params: Object.assign({}, current.params) }; },
    // the screen and the designed state the frame shows (its WB.here()), for tests and the console
    here: function () {
      try { var w = frame.contentWindow, h = w && w.WB && w.WB.contract && w.WB.here(); if (h) return { screen: h.screen || current.id, state: h.state }; } catch (e) {}
      return { screen: current.id, state: 'default' };
    },
    reloadFrame: reloadFrame,   // tools/hot-serve.mjs: a screen changed
    // WB.flow: the history the shell keeps (its «Regresar»), read and rewritten when an operation ends
    routes: function () { return ssGet(ROUTES) || []; },
    setRoutes: function (r) { ssSet(ROUTES, (r || []).slice(-30)); }
  };

  /* ==========================================================================
     The bar: the name and «See as»
     ========================================================================== */
  // «See as» has two choices: a parent (Mamá) or the kids (always Sofía, DECISIONS.md S1)
  var AS = { parent: 'p-mama', kids: 'p-sofia' };
  function renderBar() {
    // a setting as pills: its label, then one pill per choice (the one on show is pressed)
    var pick = function (k, label, now, opts) {
      return '<span class="sh-pick" role="group" aria-label="' + label + '"><span class="sh-pick-l" aria-hidden="true">' + label + '</span>' + opts.map(function (o) {
        return '<button type="button" data-sh="' + k + '" data-v="' + o[0] + '" aria-pressed="' + (o[0] === now) + '" data-testid="sh-' + k + '-' + o[0] + '">' + o[1] + '</button>';
      }).join('') + '</span>';
    };
    bar.innerHTML = '<a class="sh-brand" href="/simulator/" title="The doors"><img class="sh-hen" src="/simulator/screens/img/gallina.png" alt=""><span class="sh-brand-t"><b>ChickenStreaks</b> Simulator</span></a><span class="sh-grow"></span>'
      + '<a class="sh-reset sh-screens" href="gallery.html" data-testid="sh-screens" aria-label="See the screens">' + GRID + '<span>See the screens</span></a>'
      + pick('viewas', 'See as', WB.viewAs.role() === 'kid' ? 'kids' : 'parent', [['parent', 'Parent'], ['kids', 'Kids']])
      + pick('theme', 'Theme', WB.theme.get(), [['light', 'Light'], ['dark', 'Dark']])
      + '<button type="button" class="sh-reset" data-sh="reset" data-testid="sh-reset" aria-label="Reset">' + RESET + '<span>Reset</span></button>';
  }
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('[data-sh]'); if (!b || b.getAttribute('aria-pressed') === 'true') return;
    var k = b.getAttribute('data-sh'), v = b.getAttribute('data-v');
    if (k === 'viewas') setPerson(AS[v]);
    if (k === 'theme') { WB.theme.set(v); applyShellTheme(); renderBar(); }
    if (k === 'reset') reset();
  });
  // the family, the clock and «See as» as they were at the start (the theme stays); the history starts afresh
  // like a new install: the family as it was, signed out, «See as» Parent, the history and the last screen forgotten,
  // and the splash (the doors then offer only «Start»)
  function reset() {
    WB.reset(); WB.session.signOut(); ssSet(ROUTES, null);
    prefs.lastApp = null; savePrefs();
    open('app.splash', {});
    toast('Reset: everything is back to the start');
  }
  function setPerson(pid) {
    var before = WB.viewAs.role();
    WB.viewAs.set(pid);
    var role = WB.viewAs.role();
    toast('Now seeing as ' + (role === 'kid' ? 'Kids' : 'Parent'));
    renderBar();
    // another mode (parent ↔ kid) is another app: open that person's home; the same mode keeps the screen
    if (role !== before || role === 'kid') open(role === 'kid' ? 'app.kid' : 'app.today', {}); else reloadFrame();
  }
  function applyShellTheme() { document.documentElement.setAttribute('data-theme', WB.theme.get()); }

  /* ---------- toast ---------- */
  var toastT = null;
  function toast(text) {
    var t = $('.sh-toast'); if (!t) { t = document.createElement('div'); t.className = 'sh-toast'; t.setAttribute('data-testid', 'sh-toast'); t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = text; live.textContent = text;
    clearTimeout(toastT); toastT = setTimeout(function () { t.remove(); }, 2600);
  }

  /* ---------- the caption above the device: the phone ---------- */
  function renderCaption() {
    var d = screenDef(current.id), area = areaOf(current.id);
    var html = '';
    if (d && d.pilot === false) html += '<span class="sh-tag">Fuera del piloto</span>';
    function seg(label, list) {
      return '<span class="sh-devseg" role="group" aria-label="' + label + '">' + list.map(function (d) {
        return '<button type="button" data-p="device" data-v="' + d[0] + '" aria-pressed="' + (prefs.device === d[0]) + '">' + d[1] + '</button>';
      }).join('') + '</span>';
    }
    if (area !== 'biz') html += seg('Teléfono', PHONES);
    caption.innerHTML = html;
  }
  caption.addEventListener('click', function (e) {
    var b = e.target.closest('[data-p="device"]'); if (!b) return;
    prefs.device = b.getAttribute('data-v');
    savePrefs(); layout(); renderCaption(); dress(fdoc());
  });

  /* ==========================================================================
     Boot
     ========================================================================== */
  WB.ready(function () {
    applyShellTheme();
    WB.subscribe(function (ev) { if (ev.type === 'theme' || ev.type === 'external' || ev.type === 'reset') applyShellTheme(); if (ev.type !== 'screen') renderBar(); });
    var h = location.hash.slice(1), start;
    if (h) { var i = h.indexOf('?'); start = { id: i < 0 ? h : h.slice(0, i), params: i < 0 ? {} : paramsOf(h.slice(i + 1)) }; }
    else start = defaultScreen(prefs.area);
    // the doors' «Start from the splash» (app.html?from=splash): signed out, at the splash; the family's data stays
    if (/[?&]from=splash(&|$)/.test(location.search)) {
      WB.session.signOut(); start = { id: 'app.splash', params: {} };
      history.replaceState(null, '', location.pathname);
    }
    renderBar(); open(start.id, start.params);
    window.addEventListener('resize', layout);
  });
})();
