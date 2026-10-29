/* ==========================================================================
   The simulator's shell: the device frame (iPhone 15, Android, iPad, Tablet), the visitor bar
   (Historias · ¿Qué pasa si…? · Ver como · Reloj · Tema · Ver lo configurable · Ver lo por decidir · Comentar ·
   Empezar de nuevo), the welcome, the coach and the marker tags. The comment tool is shell/comments.js.
   The screen runs in a same-origin iframe; both read the one WB state (sim.js). window.WBShell is the bridge the
   screen's sim.js talks to (go, holding, screenChanged …).
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

  var PREFS = 'wb-shell/v1', STORY = 'wb-shell/story', SIT = 'wb-shell/situation', DONE = 'wb-shell/stories-done', EVENTS = 'wb-shell/story-events';
  var prefs = Object.assign({ welcomeSeen: false, device: 'iphone15', landscape: false, cfg: false, und: false, area: 'app', lastApp: null, lastBiz: null }, lsGet(PREFS) || {});
  function savePrefs() { lsSet(PREFS, prefs); }

  var bar = $('#sh-bar'), stage = $('#sh-stage'), caption = $('#sh-caption'), device = $('#sh-device'), screenBox = $('#sh-screen'),
    frame = $('#sh-frame'), over = $('#sh-over'), live = $('#sh-live'), chrome = $('#sh-chrome');
  var current = { id: null, params: {} };   // what the frame shows
  var panel = null;                        // the open panel's name

  /* ---------- icons (stroke, 24 grid) ---------- */
  var ICONS = {
    comment: '<path d="M4 5h16v11H8l-4 4z"/>', menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', reset: '<path d="M4 4v6h6"/><path d="M5.5 15a7 7 0 1 0 1.6-7.3L4 10"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', person: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    theme: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none"/>',
    stories: '<path d="M5 4h10l4 4v12H5z"/><path d="M9 12h6M9 16h4"/>', whatif: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.4c-.7.3-1 .8-1 1.5v.3M12 16.8v.2"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
    question: '<path d="M9.2 9a2.9 2.9 0 1 1 3.9 2.7c-.7.3-1.1.9-1.1 1.6v.4M12 17v.3"/><rect x="3.5" y="3.5" width="17" height="17" rx="5"/>',
    inbox: '<path d="M4 13.5 6.6 5.5h10.8L20 13.5V19H4z"/><path d="M4 13.5h4.6a3.4 3.4 0 0 0 6.8 0H20"/>',
    rotate: '<rect x="3" y="9" width="12" height="11" rx="2"/><path d="M13 4a7 7 0 0 1 7.5 6.5"/><path d="M17.8 9.6l2.7.9.9-2.7"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', down: '<path d="M7 10l5 5 5-5"/>'
  };
  function ico(n) { return '<svg class="sh-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[n] + '</svg>'; }

  /* ==========================================================================
     The frame
     ========================================================================== */
  // the app's devices: two phones and two tablets (Pixel 8, iPad 10th gen, Galaxy Tab S9 in CSS px), portrait
  var DEVICES = { iphone15: { w: 390, h: 844, pad: 12 }, android: { w: 412, h: 915, pad: 10 },
    ipad: { w: 820, h: 1180, pad: 20, col: 600 }, tablet: { w: 800, h: 1280, pad: 18, col: 600 }, desk: { w: 1280, h: 800 } };
  // ponytail: col — on a tablet the phone screens sit in a centred column; a real tablet layout comes with the designer's screens
  var PHONES = [['iphone15', 'iPhone 15'], ['android', 'Android']], TABLETS = [['ipad', 'iPad'], ['tablet', 'Tablet']];
  if (!DEVICES[prefs.device] || prefs.device === 'desk') prefs.device = 'iphone15';   // a device that was removed (iPhone SE) falls back
  function screenDef(id) { return (WB.index.screens || {})[id] || null; }
  function areaOf(id) { var d = screenDef(id); return d ? d.area : (/^biz\./.test(id || '') ? 'biz' : 'app'); }
  function isPhoneVisitor() { return window.innerWidth < 640; }
  function isLandscape() { return !!(prefs.landscape && DEVICES[prefs.device].col); }   // only a tablet turns
  function layout() {
    var area = areaOf(current.id) === 'biz' ? 'biz' : 'app';
    var dev = area === 'biz' ? DEVICES.desk : DEVICES[prefs.device] || DEVICES.iphone15;
    var land = area === 'app' && isLandscape();
    if (land) dev = Object.assign({}, dev, { w: dev.h, h: dev.w });
    var full = area === 'app' && isPhoneVisitor();
    document.body.classList.toggle('sh-full', full);
    device.className = 'sh-device ' + (area === 'biz' ? 'desk' : 'phone ' + prefs.device + (land ? ' landscape' : ''));
    chrome.hidden = area !== 'biz';
    frame.style.width = !full && dev.col ? dev.col + 'px' : ''; frame.style.margin = !full && dev.col ? '0 auto' : '';
    if (full) { screenBox.style.width = ''; screenBox.style.height = Math.max(stage.clientHeight, DEVICES.iphone15.h) + 'px'; device.style.transform = ''; device.style.marginBottom = ''; syncOver(); return; }   // a phone visitor: the screen keeps its designed height and the page scrolls
    screenBox.style.width = dev.w + 'px'; screenBox.style.height = dev.h + 'px';
    var outerW = dev.w + 2 * (dev.pad || 0), outerH = dev.h + 2 * (dev.pad || 0) + (area === 'biz' ? 30 : 0);
    var availW = stage.clientWidth - 32, availH = window.innerHeight - bar.offsetHeight - caption.offsetHeight - 52;
    var s = Math.min(1, availW / outerW, area === 'biz' ? Math.max(availH, 480) / outerH : Math.max(availH, 420) / outerH);
    device.style.transformOrigin = 'top center';
    device.style.transform = s < 1 ? 'scale(' + s.toFixed(4) + ')' : '';
    device.style.marginBottom = s < 1 ? (-(outerH * (1 - s))) + 'px' : '';
    var fw = frame.contentWindow;
    try { if (fw && fw.document && fw.document.documentElement) fw.document.documentElement.setAttribute('data-wb-device', area === 'biz' ? 'desktop' : prefs.device); } catch (e) {}
    syncOver();
  }
  // the overlay sits exactly over the iframe; scale() = CSS px of the shell per CSS px of the screen
  function frameRect() { return frame.getBoundingClientRect(); }
  function scale() { var r = frameRect(); return frame.offsetWidth ? r.width / frame.offsetWidth : 1; }
  function syncOver() {
    var r = frameRect(), vv = window.visualViewport, top = r.top, bot = r.bottom;
    over.style.left = r.left + 'px'; over.style.top = top + 'px'; over.style.width = r.width + 'px'; over.style.height = Math.max(0, bot - top) + 'px';
    if (vv && vv.height < window.innerHeight - 1) over.style.height = Math.max(0, Math.min(bot, vv.offsetTop + vv.height) - top) + 'px';
  }
  // an element of the screen → its rect in overlay coordinates
  function rectOf(el) {
    var r = el.getBoundingClientRect(), s = scale();
    return { x: r.left * s, y: r.top * s, w: r.width * s, h: r.height * s };
  }
  function fdoc() { try { return frame.contentDocument; } catch (e) { return null; } }
  function fwb() { try { var w = frame.contentWindow; return w && w.WB && w.WB.contract ? w.WB : null; } catch (e) { return null; } }

  /* Open Design prototypes (copied or as they are) draw their own review bar and phone bezel: in the frame, the screen
     fills the device and the review tools go away. Injected into any page with that structure. */
  var FIT_CSS = 'html,body{height:100%;overflow:hidden!important;background:transparent!important}'
    + '.stage{padding:0!important;min-height:0!important;height:100%!important;overflow:hidden!important}.stage::before{display:none!important}'
    + '.stage-bar,[data-proto-chrome]{display:none!important}'
    + '.frame-wrap,.phone{display:block!important;width:100%!important;height:100%!important;margin:0!important}'
    + '.bezel{width:100%!important;height:100%!important;padding:0!important;border:0!important;border-radius:0!important;background:none!important;box-shadow:none!important}'
    + '.screen{width:100%!important;height:100%!important;border-radius:0!important}'
    + 'html[data-wb-device]:not([data-wb-device="iphone15"]) .island{display:none!important}';   // only the iPhone has the island
  var MARK_CSS = 'html[data-wb-show-cfg] [data-wb-configurable]{outline:2px dashed currentColor!important;outline-offset:2px}'
    + 'html[data-wb-show-und] [data-wb-undecided]{outline:2px dotted #eab308!important;outline-offset:3px}'
    + 'html[data-wb-show-und] [data-wb-provisional]{outline:2px dashed #3046d7!important;outline-offset:3px}';
  function dress(doc) {
    if (!doc || !doc.head) return;
    if (!doc.getElementById('wb-shell-css')) {
      var st = doc.createElement('style'); st.id = 'wb-shell-css';
      st.textContent = (doc.querySelector('.stage .bezel .screen') ? FIT_CSS : '') + MARK_CSS;
      doc.head.appendChild(st);
    }
    var h = doc.documentElement;
    h.setAttribute('data-wb-device', areaOf(current.id) === 'biz' ? 'desktop' : prefs.device);
    if (prefs.cfg) h.setAttribute('data-wb-show-cfg', ''); else h.removeAttribute('data-wb-show-cfg');
    if (prefs.und) h.setAttribute('data-wb-show-und', ''); else h.removeAttribute('data-wb-show-und');
  }

  /* ---------- routing ---------- */
  function idForPath(pathname) {
    if (/\/simulator\/screens\/missing(\.html)?$/.test(pathname)) return null;
    return WB.screenForPath(pathname);
  }
  function paramsOf(search) { var o = {}; new URLSearchParams(search).forEach(function (v, k) { o[k] = v; }); return o; }
  function hashOf(id, params) { var q = new URLSearchParams(params || {}).toString(); return '#' + id + (q ? '?' + q : ''); }
  function open(id, params, opts) {
    params = params || {}; opts = opts || {};
    var d = screenDef(id);
    current = { id: id, params: params };
    var url = WB.href(id, params);
    if (opts.state) url += (url.indexOf('?') < 0 ? '?' : '&') + 'estado=' + encodeURIComponent(opts.state);
    remember();
    layout(); renderCaption();
    if (opts.replace) { try { frame.contentWindow.location.replace(url); } catch (e) { frame.src = url; } }   // WB.flow: no history entry
    else frame.src = url;
    if (!d) WB.track('abrió una pantalla que aún no existe');
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
    return WB.role(WB.viewAs.get().person) === 'kid' ? { id: 'app.kid', params: {} } : { id: 'app.today', params: {} };
  }
  function reloadFrame() { try { frame.contentWindow.location.reload(); } catch (e) { frame.src = frame.src; } }

  frame.addEventListener('load', function () {
    var w = frame.contentWindow, loc;
    try { loc = w.location; } catch (e) { return; }
    if (!loc || loc.href === 'about:blank') return;
    var id = idForPath(loc.pathname), params = paramsOf(loc.search);
    delete params.estado;
    if (/\/simulator\/screens\/missing(\.html)?$/.test(loc.pathname)) { id = params.id || 'dev.missing'; params = {}; }
    current = { id: id || ('unknown:' + loc.pathname.split('/').pop()), params: params };
    remember(); pushRoute();
    dress(fdoc());
    layout(); renderCaption(); renderBar();
    if (window.WBComments) window.WBComments.frameLoaded(w);
    hookFrame(w);
    derive(); drawMarks(); drawRing();
  });
  function hookFrame(w) {
    var d = fdoc(); if (!d) return;
    var redraw = debounce(function () { drawMarks(); drawRing(); }, 120);
    d.addEventListener('scroll', redraw, true);
    d.addEventListener('transitionend', redraw, true); d.addEventListener('animationend', redraw, true);   // slides that move in: measure where they end
    w.addEventListener('resize', redraw);
    try { new w.MutationObserver(redraw).observe(d.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'style', 'inert', 'data-phase', 'aria-hidden'] }); } catch (e) {}
    // the visitor's taps inside the screen go to the trail (by the element's name, never what a field holds)
    d.addEventListener('click', function (e) {
      if (window.WBComments && window.WBComments.picking()) return;
      var a = e.target.closest && e.target.closest('[data-od-id],button,a');
      if (!a) return;
      var name = window.WBComments ? window.WBComments.nameOf(a) : (a.textContent || '').trim().slice(0, 40);
      if (name) WB.track('tocó «' + name + '»');
    }, true);
  }
  function reroute(id, params) { return { id: id, params: params }; }
  // the screens visited in this tab, for «Regresar» (WB.back) across reloads of the frame
  var ROUTES = 'wb-shell/routes';
  function pushRoute() {
    var r = ssGet(ROUTES) || [], top = r[r.length - 1];
    if (top && top.id === current.id && JSON.stringify(top.params) === JSON.stringify(current.params)) return;
    r.push({ id: current.id, params: current.params }); ssSet(ROUTES, r.slice(-30));
  }
  function debounce(fn, ms) { var t = null; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  /* ==========================================================================
     The bridge the screen's sim.js uses
     ========================================================================== */
  window.WBShell = {
    go: function (id, params) { var r = reroute(id, params || {}); open(r.id, r.params); },
    back: function (fallback) {
      var r = ssGet(ROUTES) || []; r.pop(); var prev = r.pop();
      while (prev && prev.id === current.id) prev = r.pop();   // the same screen twice (another state, other params) is not «before»
      ssSet(ROUTES, r);
      if (prev) open(prev.id, prev.params); else { var d = fallback ? { id: fallback, params: {} } : defaultScreen('app'); open(d.id, d.params); }
    },
    holding: function () { return !!(story && !story.min && !story.off && !story.end); },
    timerHeld: function () {},
    screenChanged: function () { renderCaption(); derive(); drawMarks(); drawRing(); checkMission(); },
    screenLoaded: function () { derive(); drawMarks(); drawRing(); },
    current: function () { return { id: current.id, params: Object.assign({}, current.params) }; },
    reloadFrame: reloadFrame,
    open: open,
    // WB.flow: the history the shell keeps (its «Regresar»), read and rewritten when an operation ends
    routes: function () { return ssGet(ROUTES) || []; },
    setRoutes: function (r) { ssSet(ROUTES, (r || []).slice(-30)); }
  };

  /* ==========================================================================
     The bar
     ========================================================================== */
  function viewAsLabel() {
    var p = WB.viewAs.person();
    return { name: p ? p.short || p.name : '—', role: p ? accessSummary(p.id) : '—' };
  }
  // a family member in their own words: «Papá», «Hija · 7–9 años»
  function accessSummary(pid) {
    var p = WB.state.get('people', pid); if (!p) return '—';
    var name = WB.roleName(p.role, pid);
    return p.role === 'kid' ? name + ' · ' + p.ageRange.replace('-', '–') + ' años' + (p.paired ? '' : ' · sin teléfono') : name;
  }
  function frameContext() { var fw = fwb(); try { return fw ? fw.context() : WB.context(); } catch (e) { return WB.context(); } }
  function contextName(ctx) {
    var k = ctx && ctx.kid && WB.state.get('people', ctx.kid);
    return k ? k.name : 'Toda la familia';
  }
  function renderBar() {
    var area = areaOf(current.id) === 'biz' ? 'biz' : 'app', va = viewAsLabel(), sit = ssGet(SIT);
    var st = story && storyDef(story.id);
    var center = sit ? '<span class="sh-chip" data-testid="sh-situation" title="Viendo: ' + esc(sit.title) + '"><span class="sh-chip-l">Viendo: ' + esc(sit.title) + '</span> <button type="button" data-sh="normal">Volver a normal</button></span>'
      : st ? '<span class="sh-title sh-story-title sh-hide-phone" title="' + esc(st.title) + '">' + esc(st.title) + (story.min ? ' · Paso ' + story.n + ' de ' + st.steps.length : '') + '</span>' : '';
    bar.classList.toggle('has-chip', !!sit);
    bar.innerHTML =
      '<span class="sh-brand"><span class="dot" aria-hidden="true"></span><span class="sh-hide-phone">Simulación</span><small>· familia de prueba</small></span>'
      + '<span class="sh-grow"></span>' + center + '<span class="sh-grow"></span>'
      + '<button type="button" class="sh-btn sh-only-wide" data-sh="stories" aria-label="Historias" title="Historias" aria-expanded="' + (panel === 'stories') + '">' + ico('stories') + '<span class="sh-tx">Historias</span></button>'
      + '<button type="button" class="sh-btn sh-only-wide" data-sh="whatif" aria-label="¿Qué pasa si…?" title="¿Qué pasa si…?" aria-expanded="' + (panel === 'whatif') + '">' + ico('whatif') + '<span class="sh-tx">¿Qué pasa si…?</span></button>'
      + '<button type="button" class="sh-btn sh-hide-phone" data-sh="viewas" aria-expanded="' + (panel === 'viewas') + '" data-testid="sh-viewas">' + ico('person') + '<span>Ver como <b>' + esc(va.name) + '</b> <span class="sub">· ' + esc(va.role) + '</span></span></button>'
      + '<button type="button" class="sh-btn sh-only-wide" data-sh="clock" aria-expanded="' + (panel === 'clock') + '" data-testid="sh-clock-btn">' + ico('clock') + '<span>' + esc(WB.clock.format(null, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) + '</span></button>'
      + '<button type="button" class="sh-btn sh-icon sh-only-wide" data-sh="theme" aria-expanded="' + (panel === 'theme') + '" aria-label="Tema" title="Tema">' + ico('theme') + '</button>'
      + '<button type="button" class="sh-btn sh-only-wide" data-sh="cfg" title="Ver lo configurable" aria-label="Ver lo configurable" aria-pressed="' + prefs.cfg + '" data-testid="sh-cfg">' + ico('gear') + '<span class="sh-l">Ver lo configurable</span><span class="sh-s">Configurable</span></button>'
      + '<button type="button" class="sh-btn sh-only-wide" data-sh="und" title="Ver lo por decidir" aria-label="Ver lo por decidir" aria-pressed="' + prefs.und + '" data-testid="sh-und">' + ico('question') + '<span class="sh-l">Ver lo por decidir</span><span class="sh-s">Por decidir</span></button>'
      + (picking() ? '<button type="button" class="sh-btn sh-primary" data-sh="cancel-pick">Cancelar</button>'
        : '<button type="button" class="sh-btn sh-primary" data-sh="comment" data-testid="sh-comment">' + ico('comment') + 'Comentar</button>')
      + '<button type="button" class="sh-btn sh-icon sh-only-wide sh-has-dot" data-sh="mine" aria-label="Mis comentarios' + (mineUnseen() ? ' · hay novedades' : '') + '" title="Mis comentarios" aria-expanded="' + (panel === 'mine') + '" data-testid="sh-mine">' + ico('inbox') + (mineUnseen() ? '<span class="sh-dot" data-testid="sh-mine-dot"></span>' : '') + '</button>'
      + '<button type="button" class="sh-btn sh-icon sh-only-wide" data-sh="reset" aria-label="Empezar de nuevo" title="Empezar de nuevo" data-testid="sh-reset">' + ico('reset') + '</button>'
      + '<button type="button" class="sh-btn sh-icon sh-only-narrow sh-has-dot" data-sh="menu" aria-label="Menú del simulador' + (mineUnseen() ? ' · hay novedades en tus comentarios' : '') + '" aria-expanded="' + (panel === 'menu') + '" data-testid="sh-menu">' + ico('menu') + (mineUnseen() ? '<span class="sh-dot"></span>' : '') + '</button>';
    if (picking()) bar.insertAdjacentHTML('afterbegin', '');
    var pickLine = picking() ? '<span class="sh-title" data-testid="sh-pick-line">Toca lo que quieras comentar</span>' : '';
    if (pickLine) { var g = bar.querySelectorAll('.sh-grow')[0]; g.insertAdjacentHTML('afterend', pickLine); }
    // whatever the person, place or situation, the bar never pushes an item off: too wide → the long items keep their icon
    bar.classList.remove('tight'); if (bar.scrollWidth > bar.clientWidth + 1) bar.classList.add('tight');
  }
  function picking() { return !!(window.WBComments && window.WBComments.picking()); }

  bar.addEventListener('click', function (e) {
    var b = e.target.closest('[data-sh]'); if (!b) return;
    var k = b.getAttribute('data-sh');
    if (k === 'area') return switchArea(b.getAttribute('data-area'));
    if (k === 'cfg') return toggleMarks('cfg');
    if (k === 'und') { toggleMarks('und'); if (prefs.und) openPanel('decide'); else if (panel === 'decide') closePanel(); return; }
    if (k === 'comment') { closePanel(); return window.WBComments && window.WBComments.start(); }
    if (k === 'cancel-pick') return window.WBComments && window.WBComments.stop();
    if (k === 'normal') return clearSituation();
    if (panel === k) return closePanel();
    openPanel(k);
  });
  function switchArea(area) {
    if ((areaOf(current.id) === 'biz') === (area === 'biz')) return;
    var to = defaultScreen(area);
    WB.track(area === 'biz' ? 'cambió a Empresa' : 'cambió a App');
    open(to.id, to.params);
  }
  function toggleMarks(k) {
    prefs[k] = !prefs[k]; savePrefs();
    WB.track((prefs[k] ? 'prendió' : 'apagó') + (k === 'cfg' ? ' «Ver lo configurable»' : ' «Ver lo por decidir»'));
    dress(fdoc()); renderBar(); drawMarks();
  }

  /* ==========================================================================
     Panels
     ========================================================================== */
  var scrim = null;
  function closePanel() {
    if (scrim) scrim.remove(); scrim = null;
    var was = panel; panel = null; renderBar(); placeCoach(null);
    var b = was && bar.querySelector('[data-sh="' + was + '"]'); if (b) b.focus();
  }
  function layer(html, opts) {
    if (scrim) scrim.remove();
    opts = opts || {};
    scrim = document.createElement('div');
    scrim.className = 'sh-scrim' + (opts.clear ? ' clear' : '');
    scrim.innerHTML = '<section class="sh-panel ' + (opts.cls || '') + '" role="' + (opts.role || 'dialog') + '" aria-modal="' + (opts.clear ? 'false' : 'true') + '" aria-labelledby="sh-ph" data-panel="' + (opts.name || '') + '" data-testid="sh-panel-' + (opts.name || '') + '">'
      + (opts.noX ? '' : '<button type="button" class="sh-x" data-p="close" aria-label="Cerrar">' + ico('x') + '</button>') + html + '</section>';
    document.body.appendChild(scrim);
    scrim.addEventListener('click', function (e) { if (e.target === scrim && !opts.clear) closePanel(); });
    var first = scrim.querySelector('[data-autofocus]') || scrim.querySelector('button:not(.sh-x), [href], input, textarea');
    if (first) first.focus({ preventScroll: true });
    return scrim.querySelector('.sh-panel');
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (window.WBComments && window.WBComments.escape()) return;
    if (popEl) { closePop(); return; }
    if (panel) { closePanel(); return; }
    if (story && !story.min) { minimize(true); }
  });

  function openPanel(name) {
    panel = name; renderBar();
    var p = ({ welcome: pWelcome, stories: pStories, whatif: pWhatIf, viewas: pViewAs, clock: pClock, theme: pTheme, menu: pMenu, reset: pReset, decide: pDecide, mine: pMine })[name];
    if (!p) { panel = null; return; }
    var el = p();
    placeCoach(null);   // out of the panel's way
    if (!el) return;
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-p]'); if (!b) return;
      var k = b.getAttribute('data-p');
      if (k === 'close') return closePanel();
      if (handlers[k]) handlers[k](b);
    });
  }
  var handlers = {
    free: function () { prefs.welcomeSeen = true; savePrefs(); closePanel(); WB.track('eligió explorar libre'); },
    stories: function () { prefs.welcomeSeen = true; savePrefs(); openPanel('stories'); },
    story: function (b) { closePanel(); startStory(b.getAttribute('data-id')); },
    sit: function (b) { closePanel(); applySituation(b.getAttribute('data-id')); },
    person: function (b) { setPerson(b.getAttribute('data-id')); },
    advance: function (b) { advanceClock(b.getAttribute('data-by')); },
    theme: function (b) { WB.theme.set(b.getAttribute('data-v')); applyShellTheme(); openPanel('theme'); WB.track('eligió el tema ' + b.textContent.trim().toLowerCase()); },
    open: function (b) { closePanel(); openPanel(b.getAttribute('data-v')); },
    toggle: function (b) { var k = b.getAttribute('data-v'); toggleMarks(k); if (k === 'und' && prefs.und) openPanel('decide'); else openPanel('menu'); },
    comment: function () { closePanel(); if (window.WBComments) window.WBComments.start(); },
    'reset-yes': function () { resetAll(); },
    welcome: function () { openPanel('welcome'); },
    'mine-see': function (b) { seeComment(b.getAttribute('data-id')); },
    'mine-again': function (b) { sameAgain(b.getAttribute('data-id')); },
    'mine-reload': function () { WB.track('recargó tras «hecho»'); location.reload(); },
    device: function (b) { prefs.device = b.getAttribute('data-v'); savePrefs(); layout(); renderCaption(); dress(fdoc()); drawMarks(); drawRing(); },
    rotate: function () { prefs.landscape = !prefs.landscape; savePrefs(); layout(); renderCaption(); drawMarks(); drawRing(); },
    go: function (b) { closePanel(); open(b.getAttribute('data-id'), JSON.parse(b.getAttribute('data-params') || '{}')); },
    answer: function (b) { if (window.WBComments) window.WBComments.answer(b.getAttribute('data-q')); },
    area: function (b) { closePanel(); switchArea(b.getAttribute('data-v')); }
  };

  function pWelcome() {
    return layer('<h2 id="sh-ph">Bienvenido al simulador de ChickenStreaks</h2>'
      + '<ul class="sh-rows">'
      + '<li><span class="n">' + ico('check') + '</span><div><b>Todo es de prueba</b><span>Una familia inventada, sin datos reales.</span></div></li>'
      + '<li><span class="n">' + ico('stories') + '</span><div><b>Sigue una historia</b><span>O explora libre, a tu ritmo.</span></div></li>'
      + '<li><span class="n">' + ico('comment') + '</span><div><b>Comenta donde quieras</b><span>Toca «Comentar» y luego lo que quieras señalar.</span></div></li>'
      + '</ul><div class="sh-actions"><button type="button" class="sh-a" data-p="free" data-testid="sh-explore">Explorar libre</button><button type="button" class="sh-a primary" data-p="stories" data-autofocus>Ver historias</button></div>'
      + '<p class="sh-note">Tus comentarios solo los ve el equipo.</p>', { name: 'welcome', noX: true });
  }
  function storyDef(id) { return (WB.index.stories || []).find(function (s) { return s.id === id; }) || null; }
  function pStories() {
    var done = lsGet(DONE) || {}, all = WB.index.stories || [];
    var list = all.filter(function (s) { return s.coach !== false; }), missions = all.filter(function (s) { return s.coach === false; });
    var mrows = missions.map(function (s) {
      var meta = mission && mission.id === s.id ? 'En curso' : done[s.id] ? 'Hecha ✓' : 'Sin guía';
      return '<li><button type="button" data-p="story" data-id="' + esc(s.id) + '" data-testid="sh-story-' + esc(s.id) + '"><span class="t"><b>' + esc(s.title) + '</b><small>' + esc(s.line || '') + '</small></span><span class="meta">' + esc(meta) + '</span></button></li>';
    }).join('');
    var rows = list.map(function (s) {
      var meta = story && story.id === s.id ? 'Paso ' + story.n + ' de ' + s.steps.length : done[s.id] ? 'Hecha ✓' : (s.minutes || 2) + ' min';
      return '<li><button type="button" data-p="story" data-id="' + esc(s.id) + '" data-testid="sh-story-' + esc(s.id) + '"><span class="t"><b>' + esc(s.title) + '</b><small>' + esc(s.line || '') + '</small></span><span class="meta">' + esc(meta) + '</span></button></li>';
    }).join('');
    return layer('<h2 id="sh-ph">Historias</h2><p>Cada una te guía paso a paso. Tú tocas la app.</p>'
      + (rows ? '<ul class="sh-list">' + rows + '</ul>' : '<p>Aún no hay historias.</p>')
      + (mrows ? '<h3>Misiones</h3><p>Sin guía: una meta, y tú encuentras cómo.</p><ul class="sh-list" data-testid="sh-missions">' + mrows + '</ul>' : '')
      + '<div class="sh-actions"><button type="button" class="sh-a" data-p="free">Explorar libre</button></div>', { name: 'stories', cls: 'wide' });
  }
  function pWhatIf() {
    var groups = {}, order = [];
    (WB.index.situations || []).forEach(function (s) { if (!groups[s.group]) { groups[s.group] = []; order.push(s.group); } groups[s.group].push(s); });
    var cur = ssGet(SIT);
    var html = order.map(function (g) {
      return '<h3>' + esc(g) + '</h3><ul class="sh-list">' + groups[g].map(function (s) {
        return '<li><button type="button" data-p="sit" data-id="' + esc(s.id) + '" aria-pressed="' + !!(cur && cur.id === s.id) + '" data-testid="sh-sit-' + esc(s.id) + '"><span class="t"><b>' + esc(s.title) + '</b>' + (s.line ? '<small>' + esc(s.line) + '</small>' : '') + '</span></button></li>';
      }).join('') + '</ul>';
    }).join('');
    return layer('<h2 id="sh-ph">¿Qué pasa si…?</h2><p>Mira cómo responde la app, sin provocarlo.</p>' + (html || '<p>Aún no hay situaciones.</p>'), { name: 'whatif', cls: 'wide' });
  }
  function pViewAs() {
    var ctx = frameContext(), me = WB.viewAs.get().person, w = WB.state.get();
    var rows = w.people.map(function (p) {
      var role = accessSummary(p.id);
      return '<li><button type="button" data-p="person" data-id="' + esc(p.id) + '" aria-pressed="' + (p.id === me) + '" data-testid="sh-person-' + esc(p.id) + '"><span class="sh-avatar" aria-hidden="true">' + esc((p.short || p.name).slice(0, 1)) + '</span><span class="t"><b>' + esc(p.name) + '</b><small>' + esc(role) + '</small></span>' + (p.id === me ? ico('check') : '') + '</button></li>';
    }).join('');
    return layer('<h2 id="sh-ph">Ver como</h2><p>Un adulto ve el modo papá; un hijo, el suyo en su teléfono.</p>'
      + '<p class="sh-note" style="margin:0 0 6px">Pantalla sobre: <b>' + esc(contextName(ctx)) + '</b></p><ul class="sh-list">' + rows + '</ul>', { name: 'viewas', cls: 'side', clear: true });
  }
  function pClock() {
    return layer('<h2 id="sh-ph">Reloj de la simulación</h2><div class="sh-clock" data-testid="sh-clock-now">' + esc(WB.clock.format(null, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })) + '</div>'
      + '<p>Adelántalo para ver pasar los días: rachas, comodines y aprobaciones solas.</p>'
      + '<div class="sh-grid3"><button type="button" class="sh-a" data-p="advance" data-by="1h" data-testid="sh-clock-1h">+1 hora</button><button type="button" class="sh-a" data-p="advance" data-by="1d" data-testid="sh-clock-1d">Mañana 9:00</button><button type="button" class="sh-a" data-p="advance" data-by="24h" data-testid="sh-clock-24h">+24 horas</button></div>'
      + '<p class="sh-note">Solo avanza. «Empezar de nuevo» lo regresa a hoy.</p>', { name: 'clock', cls: 'side', clear: true });
  }
  function pTheme() {
    var t = WB.theme.pref();
    var b = function (v, l) { return '<button type="button" data-p="theme" data-v="' + v + '" aria-pressed="' + (t === v) + '">' + l + '</button>'; };
    return layer('<h2 id="sh-ph">Tema</h2><p>La app y el simulador cambian juntos.</p><div class="sh-segl" role="group" aria-label="Tema">' + b('light', 'Claro') + b('dark', 'Oscuro') + b('auto', 'Automático') + '</div>', { name: 'theme', cls: 'side', clear: true });
  }
  function pMenu() {
    var item = function (k, icon, label, extra) { return '<li><button type="button" data-p="' + (extra || 'open') + '" data-v="' + k + '"' + (extra === 'toggle' ? ' aria-pressed="' + prefs[k] + '"' : '') + ' data-testid="sh-m-' + k + '">' + ico(icon) + '<span class="t"><b>' + label + '</b></span></button></li>'; };
    var va = viewAsLabel();
    return layer('<h2 id="sh-ph">Simulador</h2><ul class="sh-list">'
      + item('stories', 'stories', 'Historias') + item('whatif', 'whatif', '¿Qué pasa si…?')
      + '<li><button type="button" data-p="open" data-v="mine" data-testid="sh-m-mine">' + ico('inbox') + '<span class="t"><b>Mis comentarios</b>' + (mineUnseen() ? '<small>Hay novedades</small>' : '') + '</span></button></li>'
      + '<li><button type="button" data-p="open" data-v="viewas" data-testid="sh-m-viewas">' + ico('person') + '<span class="t"><b>Ver como</b><small>' + esc(va.name + ' · ' + va.role) + '</small></span></button></li>'
      + '<li><button type="button" data-p="open" data-v="clock" data-testid="sh-m-clock">' + ico('clock') + '<span class="t"><b>Reloj</b><small>' + esc(WB.clock.format()) + '</small></span></button></li>'
      + item('theme', 'theme', 'Tema') + item('cfg', 'gear', 'Ver lo configurable', 'toggle') + item('und', 'question', 'Ver lo por decidir', 'toggle')
      + item('reset', 'reset', 'Empezar de nuevo') + '<li><button type="button" data-p="welcome">' + ico('check') + '<span class="t"><b>Ver bienvenida</b></span></button></li>'
      + '</ul>', { name: 'menu', cls: 'side', clear: true });
  }
  function pReset() {
    return layer('<h2 id="sh-ph">¿Empezar de nuevo?</h2><p>Se borra lo que hiciste en la familia de prueba y tu avance en las historias. Tus comentarios enviados se quedan.</p>'
      + '<div class="sh-actions"><button type="button" class="sh-a" data-p="close" data-autofocus>Cancelar</button><button type="button" class="sh-a danger" data-p="reset-yes" data-testid="sh-reset-yes">Empezar de nuevo</button></div>', { name: 'reset', role: 'alertdialog', noX: true });
  }
  function pDecide() {
    var m = WB.index.markers || {}, here = (screenDef(current.id) || {}), d = fdoc(), local = [];
    if (d) [].forEach.call(d.querySelectorAll('[data-wb-undecided]'), function (el) { local.push({ question: el.getAttribute('data-wb-undecided'), ref: el.getAttribute('data-wb-ref') }); });
    (here.undecided || []).forEach(function (u) { if (!local.some(function (x) { return x.question === u.question; })) local.push(u); });
    var q = function (u) { return '<div class="sh-q"><p>' + esc(u.question || u.text) + '</p>' + (u.ref || u.flow ? '<small>' + esc(u.ref || u.flow) + '</small>' : '') + '<div><button type="button" class="sh-a" data-p="answer" data-q="' + esc(u.question || u.text) + '">Responder</button></div></div>'; };
    var drafts = (m.drafts || []).map(function (s) { return '<li><button type="button" data-p="go" data-id="' + esc(s.screen) + '"><span class="t"><b>' + esc(s.title) + '</b><small>Borrador · lo diseña el equipo</small></span></button></li>'; }).join('');
    var flows = (m.openQuestions || []).map(function (u) { return q({ question: u.text.replace(/\*\*/g, ''), ref: u.flow }); }).join('');
    // provisional decisions (Addition 10): on this screen, and the whole list of the simulator, each once
    var provHere = [], provAll = [];
    // each provisional decision once: its F-n comes from the decision («F3 · …») or from the marker's ref («F5 · sense S-18…»)
    var fid = function (t, ref) { var x = /^([FP]\d+)\b/.exec(t || '') || /(?:^|[\s·])([FP]\d+)\b/.exec(ref || ''); return x ? x[1] : null; };   // «F3 · …», or a ref «… · P3 · …»
    var named = function (t, id) { return id && t.indexOf(id + ' ') !== 0 ? id + ' · ' + t : t; };
    var add = function (list, t, ref) { var id = fid(t, ref); if (t && !list.some(function (x) { return x.t === t || (id && x.id === id); })) list.push({ id: id, t: named(t, id) }); };
    if (d) [].forEach.call(d.querySelectorAll('[data-wb-provisional]'), function (el) { add(provHere, el.getAttribute('data-wb-provisional'), el.getAttribute('data-wb-ref')); });
    // every F-n of DECISIONS.md «Provisional» (m.decisions), then any marker that names none; not the ones on this screen
    (m.decisions || []).forEach(function (dd) { add(provAll, dd.id + ' · ' + dd.decision); });
    (m.provisional || []).forEach(function (pp) { add(provAll, pp.decision, pp.ref); });
    provAll = provAll.filter(function (x) { return !provHere.some(function (h) { return h.t === x.t || (h.id && h.id === x.id); }); });
    var pv = function (x) { return '<div class="sh-q"><p><span class="sh-mtag prov" style="position:static;margin-right:6px">✓ Provisional</span>' + esc(x.t) + '</p><div><button type="button" class="sh-a" data-p="answer" data-q="' + esc('Provisional: ' + x.t) + '">Responder</button></div></div>'; };
    return layer('<h2 id="sh-ph">Lo que falta decidir</h2><p>Responde aquí: tu respuesta llega como comentario.</p>'
      + '<h3>En esta pantalla</h3>' + (local.length || provHere.length ? local.map(q).join('') + provHere.map(pv).join('') : '<p>Nada pendiente aquí.</p>')
      + (provAll.length ? '<h3>Decisiones provisionales</h3>' + provAll.map(pv).join('') : '')
      + (drafts ? '<h3>Pantallas en borrador</h3><ul class="sh-list">' + drafts + '</ul>' : '')
      + (flows ? '<h3>Preguntas de los flujos</h3>' + flows : ''), { name: 'decide', cls: 'side', clear: true });
  }

  /* ---------- «Mis comentarios» (Addition 11) ----------
     What this person sent, with the state and the reply of the AI that listens on the machine that runs the simulator. It
     refreshes by itself — every 4 s while open, every 20 s closed (a dot on the button; «hecho» also says so in a toast) —
     so «en arreglo» and then «hecho · recarga» arrive without asking. A failed refresh keeps the last list. */
  var MINE_OPEN = 4000, MINE_CLOSED = 20000;
  var mine = { list: null, error: null, timer: null, sig: '' };
  function mineUnseen() { return (mine.list || []).filter(function (c) { return c.updated_at && c.updated_at > (prefs.mineSeenAt || ''); }).length; }
  function fetchMine() {
    if (!window.WBComments) return Promise.resolve();
    return window.WBComments.mine().then(function (r) {
      var before = mine.list, unseen = mineUnseen();
      if (r.ok && r.data && Array.isArray(r.data.comments)) { mine.list = r.data.comments; mine.error = null; }
      else mine.error = r.status === 404 || r.status === 405 ? 'absent' : 'offline';
      if (before && panel !== 'mine') mine.list.forEach(function (c) {
        var was = before.find(function (x) { return x.id === c.id; });
        if (was && was.status !== 'done' && c.status === 'done') toast('Tu comentario quedó hecho. Recarga la página.');
      });
      if (panel === 'mine') { markMineSeen(); fillMine(); }
      else if (mineUnseen() !== unseen) renderBar();
    });
  }
  function mineLoop() {
    clearTimeout(mine.timer);
    if (mine.error === 'absent') return;   // no comments backend here (a static host): nothing to follow
    mine.timer = setTimeout(function () { (document.hidden && panel !== 'mine' ? Promise.resolve() : fetchMine()).then(mineLoop, mineLoop); }, panel === 'mine' ? MINE_OPEN : MINE_CLOSED);
  }
  function mineRefresh() { return fetchMine().then(mineLoop, mineLoop); }
  function markMineSeen() {
    var last = (mine.list || []).reduce(function (m, c) { return c.updated_at && c.updated_at > m ? c.updated_at : m; }, prefs.mineSeenAt || '');
    if (last !== (prefs.mineSeenAt || '')) { prefs.mineSeenAt = last; savePrefs(); renderBar(); }
  }
  function pMine() {
    var el = layer('<h2 id="sh-ph">Mis comentarios</h2><p>Lo que enviaste y lo que te responden. Se actualiza solo.</p><div class="sh-mine" data-testid="sh-mine-list" aria-live="polite"></div>', { name: 'mine', cls: 'side', clear: true });
    mine.sig = ''; fillMine(); markMineSeen(); mineRefresh();
    return el;
  }
  function fillMine() {
    var box = scrim && scrim.querySelector('.sh-mine'); if (!box) return;
    var list = mine.list, sig = JSON.stringify([mine.error, (list || []).map(function (c) { return [c.id, c.status, c.reply, c.commit, c.status_unknown]; })]);
    if (sig === mine.sig) return;
    mine.sig = sig;
    var note = mine.error === 'absent' ? '<p class="sh-note">Aquí no se guardan comentarios.</p>'
      : mine.error ? '<p class="sh-note" data-testid="sh-mine-offline">Sin conexión con los comentarios. Reintento solo.</p>' : '';
    if (!list) { box.innerHTML = note || '<p class="sh-note">Cargando…</p>'; return; }
    if (!list.length) { box.innerHTML = note + '<p>Aún no envías comentarios. Toca «Comentar» y elige algo de la pantalla.</p>'; return; }
    box.innerHTML = note + '<ul class="sh-mine-items">' + list.map(mineItem).join('') + '</ul>';
  }
  function mineItem(c) {
    var d = screenDef(c.screen), st = d && (d.states || []).find(function (x) { return x.id === c.state; });
    var where = (d ? d.title : c.screen) + (st && st.title && st.title !== d.title ? ' · ' + st.title : '');
    var label = c.status === 'done' ? 'hecho · recarga' : (c.status_label || c.status) + (c.status_unknown ? ' ⚠' : '');
    var when = new Date(c.server_ts), at = isNaN(when) ? '' : when.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    var text = c.text || (c.kind === 'story_end' ? (c.thumbs === 'up' ? '👍 ' : c.thumbs === 'down' ? '👎 ' : '') + 'Fin de la historia' : '');
    return '<li class="sh-mine-item" data-testid="sh-mine-item" data-id="' + esc(c.id) + '" data-status="' + esc(c.status) + '">'
      + (c.has_shot ? '<img class="sh-mine-shot" src="' + esc(window.WBComments.shotUrl(c.id)) + '" alt="" loading="lazy">' : '<span class="sh-mine-shot none">' + ico('comment') + '</span>')
      + '<div class="sh-mine-body"><div class="sh-mine-head"><b>' + esc(where) + '</b><span class="sh-mine-st" data-testid="sh-mine-status" data-s="' + esc(STATUS_LOOK[c.status] || 'other') + '">' + esc(label) + '</span></div>'
      + '<p class="sh-mine-text">' + esc(text) + '</p>'
      + (c.reply ? '<p class="sh-mine-reply" data-testid="sh-mine-reply">' + esc(c.reply) + '</p>' : '')
      + '<small>' + esc(at + (c.view_as_name ? ' · como ' + c.view_as_name : '')) + '</small>'
      + '<div class="sh-mine-acts"><button type="button" class="sh-a" data-p="mine-see" data-id="' + esc(c.id) + '" data-testid="sh-mine-see">Ver</button>'
      + (c.status === 'done' ? '<button type="button" class="sh-a primary" data-p="mine-reload" data-testid="sh-mine-reload">Recargar</button><button type="button" class="sh-a" data-p="mine-again" data-id="' + esc(c.id) + '" data-testid="sh-mine-again">Sigue igual</button>' : '')
      + (c.reply_to ? '<small data-testid="sh-mine-reopens">Sigue igual que un comentario anterior</small>' : '') + '</div></div></li>';
  }
  var STATUS_LOOK = { new: 'new', seen: 'seen', fixing: 'fixing', done: 'done', needs_decision: 'decide', wontfix: 'wontfix' };
  // «Ver»: that screen and state, as the person who commented saw it
  function seeComment(id) {
    var c = (mine.list || []).find(function (x) { return x.id === id; }); if (!c) return;
    WB.track('abrió su comentario');
    var sit = ssGet(SIT);
    if (c.situation && (!sit || sit.id !== c.situation) && (WB.index.situations || []).some(function (x) { return x.id === c.situation; })) { closePanel(); applySituation(c.situation); }
    if (c.clock_offset_ms) { var gap = c.clock_offset_ms - (Date.parse(WB.clock.iso()) - Date.now()); if (gap >= 60000) WB.clock.advance(gap); }   // the clock only moves forward
    if (c.view_as_person && WB.state.get('people', c.view_as_person)) {
      var va = WB.viewAs.get(), cx = undefined;
      if (va.person !== c.view_as_person || (cx && va.context !== cx)) WB.viewAs.set(c.view_as_person, cx);
    }
    closePanel();
    if (screenDef(c.screen)) open(c.screen, c.params || {}, c.state && c.state !== 'default' ? { state: c.state } : {});
    else { toast('Esa pantalla ya no existe.'); return false; }
    return true;
  }
  // «Sigue igual»: that moment again, then the comment form on the same element (idea 3)
  function sameAgain(id) {
    var c = (mine.list || []).find(function (x) { return x.id === id; }); if (!c || !seeComment(id)) return;
    WB.track('dijo «Sigue igual»');
    var t0 = Date.now();
    (function ready() {
      var h = here(), d = fdoc();
      if (h.screen === c.screen && d && d.readyState === 'complete' && fwb()) return setTimeout(function () { if (window.WBComments) window.WBComments.reopen(c); }, 250);
      if (Date.now() - t0 < 8000) setTimeout(ready, 150);
    })();
  }

  /* ---------- actions behind the panels ---------- */
  function setPerson(pid) {
    var before = WB.viewAs.role();
    WB.viewAs.set(pid);
    var p = WB.viewAs.person(), va = viewAsLabel(), role = WB.viewAs.role();
    WB.track('vio como ' + (p ? p.short : pid));
    toast('Ahora ves como ' + va.name + ' · ' + va.role);
    renderBar(); openPanel('viewas');
    // another mode (parent ↔ kid) is another app: open that person's home; the same mode keeps the screen
    if (role !== before || role === 'kid') open(role === 'kid' ? 'app.kid' : 'app.today', {}); else reloadFrame();
  }
  function advanceClock(by) {
    WB.clock.advance(by);
    toast('Ahora: ' + WB.clock.format());
    renderBar(); openPanel('clock'); reloadFrame();
  }
  function applyShellTheme() { document.documentElement.setAttribute('data-theme', WB.theme.get()); }

  /* ---------- «¿Qué pasa si…?» ---------- */
  function applySituation(id) {
    var s = (WB.index.situations || []).find(function (x) { return x.id === id; }); if (!s) return;
    var prev = ssGet(SIT);
    var snap = prev ? prev.snapshot : localStorage.getItem('cs-sim/v1');
    var back = prev ? prev.back : { id: current.id, params: current.params };
    if (story) { story.off = true; saveStory(); }
    if (s.scenario && s.scenario !== WB.scenario.current()) WB.reset(s.scenario);
    if (s.patch && s.patch.length) WB.state.patch(s.patch, null);
    if (s.viewAs) WB.viewAs.set(s.viewAs.person, s.viewAs.context);
    if (s.session && s.session.signedIn) WB.session.signIn(s.viewAs && s.viewAs.person);
    if (s.advance) WB.clock.advance(s.advance);
    ssSet(SIT, { id: s.id, title: s.title, snapshot: snap, back: back });
    WB.track('abrió «¿Qué pasa si…?»: ' + s.title);
    var o = s.open || {};
    if (o.screen) open(o.screen, o.params || {}, { state: o.state }); else reloadFrame();
    renderBar();
  }
  function clearSituation() {
    var s = ssGet(SIT); if (!s) return;
    if (s.snapshot) localStorage.setItem('cs-sim/v1', s.snapshot);
    ssSet(SIT, null);
    window.dispatchEvent(new StorageEvent('storage', { key: 'cs-sim/v1' }));   // this document reads it again
    WB.track('volvió a normal');
    open(s.back.id, s.back.params);
    renderBar();
  }

  /* ---------- Empezar de nuevo ---------- */
  function resetAll() {
    var seen = prefs.welcomeSeen;
    mission = null; ssSet(MISSION, null); renderMission();
    ['cs-sim/v1', PREFS, DONE, EVENTS].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
    ['cs-sim/trail', STORY, SIT, 'wb-shell/pins', 'wb-shell/draft', 'wb-shell/routes'].forEach(function (k) { try { sessionStorage.removeItem(k); } catch (e) {} });
    prefs = { welcomeSeen: seen, device: prefs.device, landscape: prefs.landscape, cfg: false, und: false, area: 'app', lastApp: null, lastBiz: null, mineSeenAt: prefs.mineSeenAt }; savePrefs();   // comments stay, and so does what was seen of them
    story = null; endCoach();
    WB.reset(WB.index.defaultScenario);
    applyShellTheme();
    closePanel();
    if (window.WBComments) window.WBComments.reset();
    var d = defaultScreen('app'); open(d.id, d.params);
    toast('Listo: todo está como al principio.');
  }

  /* ---------- toast ---------- */
  var toastT = null;
  function toast(text) {
    var t = $('.sh-toast'); if (!t) { t = document.createElement('div'); t.className = 'sh-toast'; t.setAttribute('data-testid', 'sh-toast'); t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = text; live.textContent = text;
    clearTimeout(toastT); toastT = setTimeout(function () { t.remove(); }, 2600);
  }

  /* ---------- the caption above the device: «Borrador», the phone size ---------- */
  function renderCaption() {
    var d = screenDef(current.id), area = areaOf(current.id);
    var html = '';
    if (d && d.design === 'draft' && !d.hidden) html += '<span class="sh-tag" data-testid="sh-draft">Borrador</span>';
    if (d && d.pilot === false) html += '<span class="sh-tag">Fuera del piloto</span>';
    function seg(label, list) {
      return '<span class="sh-devseg" role="group" aria-label="' + label + '">' + list.map(function (d) {
        return '<button type="button" data-p="device" data-v="' + d[0] + '" aria-pressed="' + (prefs.device === d[0]) + '">' + d[1] + '</button>';
      }).join('') + '</span>';
    }
    if (area !== 'biz') html += seg('Teléfono', PHONES) + seg('Tableta', TABLETS);
    if (area !== 'biz' && DEVICES[prefs.device].col) html += '<span class="sh-devseg"><button type="button" data-p="rotate" data-testid="sh-rotate" aria-pressed="' + isLandscape() + '" aria-label="' + (isLandscape() ? 'Girar a vertical' : 'Girar a horizontal') + '" title="' + (isLandscape() ? 'Girar a vertical' : 'Girar a horizontal') + '">' + ico('rotate') + '</button></span>';
    caption.innerHTML = html;
  }
  caption.addEventListener('click', function (e) { var b = e.target.closest('[data-p]'); if (b && handlers[b.getAttribute('data-p')]) handlers[b.getAttribute('data-p')](b); });

  /* ==========================================================================
     Markers: «Ver lo configurable» and «Ver lo por decidir» tags over the screen
     ========================================================================== */
  var popEl = null;
  function closePop() { if (popEl) popEl.remove(); popEl = null; }
  function drawMarks() {
    [].forEach.call(over.querySelectorAll('.sh-mtag'), function (t) { t.remove(); });
    if (!prefs.cfg && !prefs.und) return;
    var d = fdoc(); if (!d || !d.body) return;
    var W = over.clientWidth, H = over.clientHeight, placed = [];
    function tag(el, kind) {
      var cs = el.ownerDocument.defaultView.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      var r = rectOf(el); if (r.w < 2 || r.h < 2 || r.y + r.h < 0 || r.y > H || r.x > W || r.x + r.w < 0) return;
      if (covered(el)) return;   // under a sheet or a window of the screen (sense R-28): no tag floating over it
      var x = Math.max(4, Math.min(W - 120, r.x)), y = r.y - 28 >= 2 ? r.y - 28 : r.y + 4;
      while (placed.some(function (p) { return Math.abs(p.x - x) < 110 && Math.abs(p.y - y) < 26; })) y += 26;
      placed.push({ x: x, y: y });
      var b = document.createElement('button'); b.type = 'button'; b.className = 'sh-mtag ' + kind;
      b.style.left = x + 'px'; b.style.top = y + 'px';
      b.innerHTML = kind === 'cfg' ? '⚙ Configurable' : kind === 'prov' ? '✓ Provisional' : '? Por decidir';
      b.setAttribute('data-testid', 'sh-mtag-' + kind);
      b.addEventListener('click', function (e) { e.stopPropagation(); note(el, kind, b); });
      over.appendChild(b);
    }
    if (prefs.cfg) [].forEach.call(d.querySelectorAll('[data-wb-configurable]'), function (el) { tag(el, 'cfg'); });
    if (prefs.und) [].forEach.call(d.querySelectorAll('[data-wb-undecided]'), function (el) { tag(el, 'und'); });
    if (prefs.und) [].forEach.call(d.querySelectorAll('[data-wb-provisional]'), function (el) { tag(el, 'prov'); });
  }
  // true when something else of the screen (a sheet, a dialog) is on top of every probe point of the element
  function covered(el) {
    var d = el.ownerDocument, w = d.defaultView, b = el.getBoundingClientRect();
    var pts = [[b.left + b.width / 2, b.top + b.height / 2], [b.left + 4, b.top + 4], [b.right - 4, b.top + 4], [b.left + 4, b.bottom - 4]];
    return pts.every(function (p) {
      var x = Math.min(Math.max(p[0], 1), w.innerWidth - 1), y = Math.min(Math.max(p[1], 1), w.innerHeight - 1), hit = d.elementFromPoint(x, y);
      return hit && hit !== el && !el.contains(hit) && !hit.contains(el);
    });
  }
  function note(el, kind, btn) {
    closePop();
    var settings = (WB.index.markers && WB.index.markers.settings) || {};
    var html;
    if (kind === 'cfg') {
      var key = el.getAttribute('data-wb-configurable'), s = settings[key] || {};
      var label = el.getAttribute('data-wb-label') || s.name || key, def = el.getAttribute('data-wb-default') || s.default || '—';
      html = '<b>⚙ Configurable · ' + esc(label) + '</b><p>Por omisión: ' + esc(def) + '.</p>';
    } else if (kind === 'prov') {
      var dec = el.getAttribute('data-wb-provisional');
      html = '<b>✓ Provisional</b><p>' + esc(dec) + '</p><p class="sh-note" style="margin-top:6px">Decidido por ahora; se confirma con el equipo.</p>'
        + '<div class="sh-actions" style="justify-content:flex-start;margin-top:10px"><button type="button" class="sh-a" data-q="' + esc('Provisional: ' + dec) + '">Responder</button></div>';
    } else {
      html = '<b>? Por decidir</b><p>' + esc(el.getAttribute('data-wb-undecided')) + '</p>'
        + '<div class="sh-actions" style="justify-content:flex-start;margin-top:10px"><button type="button" class="sh-a" data-q="' + esc(el.getAttribute('data-wb-undecided')) + '">Responder</button></div>';
    }
    popEl = document.createElement('div'); popEl.className = 'sh-pop'; popEl.setAttribute('role', 'dialog'); popEl.setAttribute('data-testid', 'sh-note');
    popEl.innerHTML = '<button type="button" class="sh-x" aria-label="Cerrar" style="width:32px;height:32px;right:6px;top:6px">' + ico('x') + '</button>' + html;
    document.body.appendChild(popEl);
    var r = btn.getBoundingClientRect();
    popEl.style.left = Math.max(12, Math.min(window.innerWidth - popEl.offsetWidth - 12, r.left)) + 'px';
    popEl.style.top = Math.min(window.innerHeight - popEl.offsetHeight - 12, r.bottom + 6) + 'px';
    popEl.querySelector('.sh-x').addEventListener('click', function () { closePop(); btn.focus(); });
    var a = popEl.querySelector('[data-q]');
    if (a) a.addEventListener('click', function () { var q = a.getAttribute('data-q'); closePop(); if (window.WBComments) window.WBComments.answer(q, el); });
    popEl.querySelector('.sh-x').focus();
  }
  document.addEventListener('click', function (e) { if (popEl && !popEl.contains(e.target) && !e.target.closest('.sh-mtag')) closePop(); });

  /* ==========================================================================
     The coach (stories). The app is the source of truth: the coach derives its step from what the screen shows.
     It never advances by itself: while it is open and on the path, the screen's timers wait (WBShell.holding).
     ========================================================================== */
  var story = ssGet(STORY);   // { id, n, min, off, end }
  var coachEl = null, pillEl = null, busy = false;
  function saveStory() { ssSet(STORY, story); }
  function startStory(id) {
    var s = storyDef(id); if (!s) return;
    if (mission) endMission(false, true);
    if (s.coach === false) return startMission(s);
    if (ssGet(SIT)) { ssSet(SIT, null); }
    WB.reset(s.scenario || WB.index.defaultScenario);
    if (s.viewAs) WB.viewAs.set(s.viewAs.person, s.viewAs.context);
    if (s.session && s.session.signedIn) WB.session.signIn(s.viewAs && s.viewAs.person);
    story = { id: id, n: 1, min: false, off: false, end: false }; saveStory();
    storyEvent(id, 'started');
    WB.track('empezó la historia «' + s.title + '»');
    var st = s.start || { screen: s.steps[0].screen };
    open(st.screen, st.params || {});
    renderCoach(); renderBar();
  }
  function storyEvent(id, ev, step) {
    var sent = lsGet(EVENTS) || {}, k = id + ':' + ev + (step ? '@' + step : ''); if (sent[k]) return;
    sent[k] = 1; lsSet(EVENTS, sent);
    if (window.WBComments) window.WBComments.storyEvent(id, ev, step);
  }
  function here() {
    var fw = fwb();
    if (fw) { try { var h = fw.here(); return { screen: h.screen || current.id, state: h.state }; } catch (e) {} }
    return { screen: current.id, state: current.params.estado || 'default' };
  }
  function matches(step, h) {
    if (!step || step.screen !== h.screen) return false;
    if (!step.state || step.state === '*') return true;
    return (Array.isArray(step.state) ? step.state : [step.state]).indexOf(h.state) >= 0;
  }
  function derive() {
    if (!story || story.end) return;
    var s = storyDef(story.id); if (!s) { story = null; saveStory(); return; }
    var h = here(), n = story.n, step = s.steps[n - 1];
    if (matches(step, h)) { if (story.off) { story.off = false; } }
    else {
      var j = -1;
      for (var i = n; i < s.steps.length; i++) if (matches(s.steps[i], h)) { j = i; break; }
      if (j >= 0) { story.n = j + 1; story.off = false; busy = false; }
      // the last step done by hand (a tap that leaves the screen, «Ver movimiento»): the story ends, it is not left (S4 #15)
      else if (n === s.steps.length && h.screen !== step.screen && (step.kind === 'tap' || step.kind === 'input')) { saveStory(); return finishStory(); }
      // the same screen in another state — the person typing a name, a toggle — is still this step (U-10)
      else if (h.screen === step.screen) { if (story.off) story.off = false; }
      else if (!busy) story.off = true;
    }
    saveStory(); renderCoach(); renderBar(); drawRing();
  }
  function stepTarget(step) {
    var d = fdoc(); if (!d || !step) return null;
    var pick = function (id) { if (!id) return null; var all = d.querySelectorAll('[data-od-id="' + id + '"]'); for (var i = 0; i < all.length; i++) if (visible(all[i])) return all[i]; return all[0] || null; };
    return { target: pick(step.target), area: pick(step.area) };
  }
  function visible(el) {
    if (el.closest('[inert],[aria-hidden="true"]') && !el.closest('[aria-hidden="true"]').contains(el.ownerDocument.activeElement)) { var r0 = el.getBoundingClientRect(); if (r0.width < 1) return false; }
    var r = el.getBoundingClientRect(), w = el.ownerDocument.defaultView;
    return r.width > 0 && r.height > 0 && r.right > 0 && r.left < w.innerWidth && r.bottom > 0 && r.top < w.innerHeight;
  }
  var scrolledKey = null;   // the step whose target was last brought into view
  function drawRing() {
    var old = over.querySelector('.sh-ring'); if (old) old.remove();
    if (!story || story.min || story.off || story.end || picking()) return;
    var s = storyDef(story.id), step = s && s.steps[story.n - 1], t = stepTarget(step);
    var el = t && (t.area || t.target); if (!el) { coachR = null; return; }
    var r = rectOf(el); coachR = r;
    var ring = document.createElement('div'); ring.className = 'sh-ring' + (step.dim === false ? ' nodim' : ''); ring.setAttribute('data-testid', 'sh-ring');
    ring.style.left = (r.x - 4) + 'px'; ring.style.top = (r.y - 4) + 'px'; ring.style.width = (r.w + 8) + 'px'; ring.style.height = (r.h + 8) + 'px';
    if ((step.kind === 'tap' || step.kind === 'input') && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) ring.innerHTML = '<span class="tap"></span>';
    over.insertBefore(ring, over.firstChild);
    var key = story.id + '#' + story.n;
    // only inside the framed device: a phone visitor's page scrolls in their own hand, and moving it fights their scroll
    if (key !== scrolledKey && !document.body.classList.contains('sh-full')) { scrolledKey = key; if (!visible(el)) { el.scrollIntoView({ block: 'center', inline: 'nearest' }); return setTimeout(drawRing, 350); } }
    placeCoach(r);
  }
  function renderCoach() {
    if (coachEl) coachEl.remove(); coachEl = null;
    if (pillEl) pillEl.remove(); pillEl = null;
    if (!story || story.end) return;
    var s = storyDef(story.id); if (!s) return;
    var step = s.steps[story.n - 1], m = s.steps.length, last = story.n === m;
    if (story.min) {
      pillEl = document.createElement('button'); pillEl.type = 'button'; pillEl.className = 'sh-coach-pill'; pillEl.setAttribute('data-testid', 'sh-coach-pill');
      pillEl.textContent = story.off ? 'Fuera de la historia · Volver al paso ' + story.n : 'Paso ' + story.n + ' de ' + m + ' · Ver paso';
      pillEl.addEventListener('click', function () { story.min = false; saveStory(); if (story.off) backToStep(); renderCoach(); renderBar(); drawRing(); });
      document.body.appendChild(pillEl); return;
    }
    coachEl = document.createElement('section');
    coachEl.className = 'sh-coach' + (story.off ? ' off' : '');
    coachEl.setAttribute('role', 'dialog'); coachEl.setAttribute('aria-modal', 'false'); coachEl.setAttribute('aria-label', 'Paso ' + story.n + ' de ' + m);
    coachEl.setAttribute('data-testid', 'sh-coach'); coachEl.setAttribute('data-step', story.n); coachEl.setAttribute('data-story', story.id);
    var dots = ''; for (var i = 1; i <= m; i++) dots += '<i class="' + (i <= story.n ? 'on' : '') + '"></i>';
    var body = story.off
      ? '<p class="line">Saliste de la historia.</p><p class="sub">Puedes volver al paso ' + story.n + ' o seguir libre.</p>'
        + '<div class="sh-actions"><button type="button" class="sh-a" data-c="quit">Salir de la historia</button><button type="button" class="sh-a primary" data-c="back">Volver al paso ' + story.n + '</button></div>'
      : '<p class="line">' + rich(step.text) + '</p>' + (step.sub ? '<p class="sub">' + rich(step.sub) + '</p>' : '')
        + (hint && hint.key === story.id + '#' + story.n ? '<p class="sub sh-coach-hint" role="status" data-testid="sh-coach-hint">' + esc(hint.text) + '</p>' : '')
        + '<div class="dots" aria-hidden="true">' + dots + '</div>'
        + '<div class="sh-actions">' + (story.n > 1 ? '<button type="button" class="sh-a" data-c="prev">Atrás</button>' : '')
        + '<button type="button" class="sh-a primary" data-c="next" data-testid="sh-coach-next"' + (busy ? ' aria-disabled="true" aria-busy="true"' : '') + '>' + (last ? 'Terminar' : 'Siguiente') + '</button></div>';
    coachEl.innerHTML = '<div class="top"><span class="n">Paso ' + story.n + ' de ' + m + '</span><b title="' + esc(s.title) + '">' + esc(s.title) + '</b><button type="button" class="sh-x" data-c="min" aria-label="Minimizar la guía">' + ico('down') + '</button></div>' + body;
    document.body.appendChild(coachEl);
    coachEl.addEventListener('click', function (e) { var b = e.target.closest('[data-c]'); if (b) coachAction(b.getAttribute('data-c')); });
    live.textContent = story.off ? 'Saliste de la historia.' : 'Paso ' + story.n + ' de ' + m + '. ' + plain(step.text);
    placeCoach(null);
    var nx = coachEl.querySelector('[data-c="next"],[data-c="back"]'), key = story.id + '#' + story.n + (story.off ? 'off' : '');
    if (nx && key !== focusedKey && document.activeElement !== frame && !panel && !(window.WBComments && window.WBComments.formOpen())) nx.focus({ preventScroll: true });
    focusedKey = key;
  }
  // a story's text and typed values name the «Ver como» person: {name}, {email}
  function personal(t) {
    var p = WB.viewAs.person() || {};
    var last = String(p.name || '').replace(p.short || '', '').trim();
    return String(t || '').replace(/\{email\}/g, p.email || '').replace(/\{name\}/g, p.short || p.name || '').replace(/\{last\}/g, last);
  }
  function rich(t) { t = personal(t); return esc(t).replace(/«([^»]+)»/g, '<q>$1</q>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'); }
  function plain(t) { return String(t || '').replace(/\*\*/g, ''); }
  var coachR = null;   // what the coach explains (the ring's rect), so it can be placed again when a panel opens or closes
  function placeCoach(r) {
    if (!coachEl) return;
    if (r === null && coachR) r = coachR;
    var fr = frameRect(), cw = coachEl.offsetWidth, ch = coachEl.offsetHeight, vw = window.innerWidth, vh = window.innerHeight, top0 = bar.offsetHeight + 8;
    var x, y, area = areaOf(current.id);
    var tgt = r ? { top: fr.top + r.y, bottom: fr.top + r.y + r.h, left: fr.left + r.x, right: fr.left + r.x + r.w } : null;
    if (document.body.classList.contains('sh-full') || vw < 640) {
      x = 8; y = vh - ch - 8;
      if (tgt && tgt.bottom > y - 8) y = top0;          // never over what it explains
    } else if (area !== 'biz' && fr.right + 16 + cw <= vw - 8) {
      x = fr.right + 16; y = tgt ? Math.max(top0, Math.min(vh - ch - 12, (tgt.top + tgt.bottom) / 2 - ch / 2)) : Math.max(top0, fr.top + 40);
    } else if (area !== 'biz' && fr.left - 16 - cw >= 8) {
      x = fr.left - 16 - cw; y = tgt ? Math.max(top0, Math.min(vh - ch - 12, (tgt.top + tgt.bottom) / 2 - ch / 2)) : Math.max(top0, fr.top + 40);
    } else {
      x = vw - cw - 16; y = vh - ch - 16;
      if (tgt && tgt.right > x - 8 && tgt.bottom > y - 8) { x = 16; if (tgt.left < x + cw + 8) { y = top0; x = vw - cw - 16; } }
    }
    // an open panel is never under the coach (sense T-4: «Ver como» while a step asks to pick Sofía): the coach steps aside —
    // left of the device, bottom left, left of the panel —, clear of what it explains; with no room, or a modal panel, it
    // goes under the panel, so a tap on the panel always reaches the panel
    var pEl = scrim && scrim.querySelector('.sh-panel'), under = false;
    if (pEl && !scrim.classList.contains('clear')) under = true;
    else if (pEl) {
      var pr = pEl.getBoundingClientRect();
      var box = function (px, py) { return { left: px, top: py, right: px + cw, bottom: py + ch }; };
      var hit = function (a, b) { return a.left < b.right + 8 && a.right > b.left - 8 && a.top < b.bottom + 8 && a.bottom > b.top - 8; };
      if (hit(box(x, y), pr)) {
        var alts = [[fr.left - 16 - cw, y], [16, vh - ch - 16], [pr.left - 16 - cw, y], [pr.left - 16 - cw, vh - ch - 16]];
        var ok = alts.find(function (a) { return a[0] >= 8 && a[1] >= top0 && a[1] + ch <= vh - 4 && !hit(box(a[0], a[1]), pr) && !(tgt && hit(box(a[0], a[1]), tgt)); });
        if (ok) { x = ok[0]; y = ok[1]; } else under = true;
      }
    }
    coachEl.classList.toggle('under', under);
    coachEl.style.left = Math.round(x) + 'px'; coachEl.style.top = Math.round(y) + 'px';
  }
  function coachAction(k) {
    var s = storyDef(story.id), step = s.steps[story.n - 1];
    if (k === 'min') return minimize(true);
    if (k === 'quit') { WB.track('salió de la historia en el paso ' + story.n); storyEvent(story.id, 'quit', story.n); story = null; saveStory(); endCoach(); renderBar(); return; }
    if (k === 'back') return backToStep();
    if (k === 'prev') { story.n = Math.max(1, story.n - 1); saveStory(); return backToStep(); }
    if (k !== 'next' || busy) return;
    if (story.n === s.steps.length) return finishStory();
    var kind = step.kind || 'read', t = stepTarget(step), fw = fwb();
    if (kind === 'read') { story.n++; saveStory(); return derive(); }
    // a step whose target this screen does not have is never faked: «Siguiente» would otherwise «finish» what nobody did
    // (sense V-1: «Ve a sus accesos», nothing lit, and the story ended without the invitation accepted)
    if ((kind === 'tap' || kind === 'input') && !(t && t.target)) {
      hint = { key: story.id + '#' + story.n, text: 'No encuentro qué tocar en esta pantalla. Hazlo tú, o comenta qué falta.' };
      WB.track('la guía no encontró «' + (step.target || '?') + '»');
      return renderCoach();
    }
    busy = true; renderCoach();
    var before = here(), moved = false;
    var check = function () { var h = here(); return h.screen !== before.screen || h.state !== before.state; };
    if (kind === 'wait') {   // release what the screen holds; if it holds nothing yet, release it as soon as it does
      var tw = Date.now();
      (function rel() { var f = fwb(); if (f && f.timers.release() > 0) return; if (Date.now() - tw < 5000 && story) setTimeout(rel, 100); })();
    }
    if (kind === 'tap' && t && t.target) frameClick(t.target);
    if (kind === 'input' && t && t.target) { typeInto(t.target, personal(step.value || '')); if (step.then) { var then = stepTarget({ target: step.then }); setTimeout(function () { if (then && then.target) frameClick(then.target); }, 120); } }
    // one press, one step: busy until the app shows the next step; a change in place (same screen and state) moves on after 1.5 s
    var t0 = Date.now();
    (function wait() {
      if (!story) return;
      if (check()) { moved = true; busy = false; return derive(); }
      if (Date.now() - t0 > 1500) {
        busy = false;
        var nxt = s.steps[story.n];
        if (nxt && matches(nxt, here())) story.n++;
        else if (kind !== 'wait') story.n++;
        saveStory(); renderCoach(); drawRing(); return;
      }
      setTimeout(wait, 100);
    })();
  }
  /* a tap the coach makes inside the screen runs as the screen's own code: Safari resolves a relative link the page sets
     (location.href = "signup.html") against the script that started it, which must be the screen, not the shell */
  function frameClick(el) {
    var w = el.ownerDocument.defaultView;
    try { w.setTimeout(new w.Function("el", "el.click()"), 0, el); } catch (e) { el.click(); }
  }
  function typeInto(el, value) {
    var w = el.ownerDocument.defaultView;
    if (/^(INPUT|TEXTAREA)$/.test(el.tagName)) {
      el.focus(); var set = Object.getOwnPropertyDescriptor(w[el.tagName === 'INPUT' ? 'HTMLInputElement' : 'HTMLTextAreaElement'].prototype, 'value').set;
      set.call(el, value); el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true }));
      return;
    }
    String(value).split('').forEach(function (c, i) { setTimeout(function () { var k = el.querySelector('[data-k="' + c + '"]'); if (k) frameClick(k); }, i * 90); });
  }
  function backToStep() {
    var s = storyDef(story.id), step = s.steps[story.n - 1];
    story.off = false; saveStory();
    open(step.screen, step.params || {}, { state: Array.isArray(step.state) ? step.state[0] : step.state && step.state !== '*' && step.state !== 'default' ? step.state : null });
    renderCoach();
  }
  function minimize(on) { if (!story) return; story.min = on; saveStory(); renderCoach(); renderBar(); drawRing(); if (on && pillEl) pillEl.focus(); }
  function endCoach() { if (coachEl) coachEl.remove(); if (pillEl) pillEl.remove(); coachEl = pillEl = null; var r = over.querySelector('.sh-ring'); if (r) r.remove(); }
  var focusedKey = null;   // the step the coach last took the focus for

  /* ==========================================================================
     «Misiones» (inspiration idea 7, CONTRACT §5): a story with "coach": false and a "goal". No guide, no taps done for the
     person: a goal, a small bar with «Me rindo», and the end when the world reaches the goal — with the time it took, the
     trail, and an optional question («¿Qué nombre es más claro…?»). It reports through the story_end comment: thumbs up
     when done, down when not, the time and the answer in its text, the last actions in its runtime. Counts: started,
     completed, quit. The goal: { screen, state } reached · { record: { col, id?,
     match } } a record like it; every key given must hold. Amounts compare as numbers; an array means «one of».
     ========================================================================== */
  var MISSION = 'wb-shell/mission', mission = ssGet(MISSION), missionEl = null;
  function like(v, pat) {
    if (Array.isArray(pat)) return pat.some(function (p) { return like(v, p); });
    if (pat && typeof pat === 'object') return !!(v && typeof v === 'object') && Object.keys(pat).every(function (k) { return like(v[k], pat[k]); });
    if (typeof pat === 'string' && /^-?\d+(\.\d+)?$/.test(pat) && v != null && /^-?\d+(\.\d+)?$/.test(String(v))) return Number(pat) === Number(v);
    return v === pat;
  }
  function goalMet(m, def) {
    var g = def.goal || {}, w = WB.state.get(), h = here();
    if (g.screen && !(h.screen === g.screen && (!g.state || [].concat(g.state).indexOf(h.state) >= 0))) return false;
    if (g.record) {
      var r = g.record, seen = m.seen[r.col] || [];
      if (!(w[r.col] || []).some(function (x) { return (r.id ? x.id === r.id : seen.indexOf(x.id) < 0) && like(x, r.match || {}); })) return false;
    }
    return !!(g.screen || g.record);
  }
  function startMission(s) {
    if (story) { story = null; saveStory(); endCoach(); }
    if (ssGet(SIT)) ssSet(SIT, null);
    WB.reset(s.scenario || WB.index.defaultScenario);
    if (s.viewAs) WB.viewAs.set(s.viewAs.person, s.viewAs.context);
    if (s.session && s.session.signedIn) WB.session.signIn(s.viewAs && s.viewAs.person);
    var w = WB.state.get(), seen = {};
    if (s.goal && s.goal.record && !s.goal.record.id) seen[s.goal.record.col] = (w[s.goal.record.col] || []).map(function (x) { return x.id; });
    mission = { id: s.id, t0: Date.now(), seen: seen }; ssSet(MISSION, mission);
    storyEvent(s.id, 'started');
    WB.track('empezó la misión «' + s.title + '»');
    open(s.start.screen, s.start.params || {});
    renderMission(); renderBar();
  }
  function checkMission() {
    if (!mission || mission.over) return;
    var s = storyDef(mission.id); if (!s) { mission = null; ssSet(MISSION, null); return renderMission(); }
    if (goalMet(mission, s)) endMission(true);
  }
  function took(ms) { var sec = Math.max(1, Math.round(ms / 1000)), m = Math.floor(sec / 60); return (m ? m + ' min ' : '') + (sec % 60) + ' s'; }
  function endMission(done, silent) {
    var m = mission; if (!m) return;
    var s = storyDef(m.id), ms = Date.now() - m.t0;
    mission = null; ssSet(MISSION, null); renderMission(); renderBar();
    if (!s) return;
    if (done) { var dn = lsGet(DONE) || {}; dn[s.id] = 1; lsSet(DONE, dn); storyEvent(s.id, 'completed'); } else storyEvent(s.id, 'quit');
    WB.track((done ? 'cumplió' : 'dejó') + ' la misión «' + s.title + '»');
    // the report goes now, however the card is closed — done or not, the time, the trail (sense X-1: «Me rindo» and the ✕
    // sent nothing); an answer given after adds to it, linked by reply_to
    var line = 'Misión ' + (done ? 'hecha' : 'no hecha') + ' en ' + took(ms);
    var first = window.WBComments ? window.WBComments.thumbs(s.id, done ? 'up' : 'down', line) : Promise.resolve(null);
    var answerWith = function (answer) {
      if (!answer || !window.WBComments) return;
      first.then(function (r) { window.WBComments.thumbs(s.id, done ? 'up' : 'down', line + ' · Respuesta: ' + answer, r && r.ok && r.data ? r.data.id : null); });
    };
    if (silent) return;
    var q = s.question;
    var el = layer('<h2 id="sh-ph">' + (done ? '¡Lo lograste!' : 'Quedó pendiente') + '</h2><p data-testid="sh-mission-took">' + (done ? 'En ' : 'Después de ') + esc(took(ms)) + '.</p>'
      + (q ? '<p>' + esc(q.text) + '</p><div class="sh-actions" style="justify-content:flex-start;flex-wrap:wrap" role="group" aria-label="' + esc(q.text) + '">'
        + q.options.map(function (o) { return '<button type="button" class="sh-a" data-q="' + esc(o) + '" data-testid="sh-mission-answer">' + esc(o) + '</button>'; }).join('') + '</div>' : '')
      + '<div class="sh-actions"><button type="button" class="sh-a" data-q="" data-testid="sh-mission-close">' + (q ? 'Saltar' : 'Listo') + '</button></div>', { name: 'mission-end' });
    panel = 'mission-end';   // Escape, its ✕ and the backdrop close it, like any panel
    var answered = false;
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-p="close"]')) return closePanel();
      var b = e.target.closest('[data-q]'); if (!b || answered) return;
      answered = true; answerWith(b.getAttribute('data-q') || null); closePanel();
      if (b.getAttribute('data-q')) toast('Gracias. Tu respuesta llegó.');
    });
  }
  // the bar of a mission in course: its goal and «Me rindo» — no guide
  function renderMission() {
    if (missionEl) missionEl.remove(); missionEl = null;
    var s = mission && storyDef(mission.id); if (!s) return;
    missionEl = document.createElement('section');
    missionEl.className = 'sh-coach sh-mission'; missionEl.setAttribute('role', 'status'); missionEl.setAttribute('data-testid', 'sh-mission');
    missionEl.innerHTML = '<div class="top"><span class="n">Misión</span><b title="' + esc(s.title) + '">' + esc(s.title) + '</b></div>'
      + (s.line ? '<p class="sub">' + esc(s.line) + '</p>' : '')
      + '<div class="sh-actions"><button type="button" class="sh-a" data-m="quit" data-testid="sh-mission-quit">Me rindo</button></div>';
    document.body.appendChild(missionEl);
    missionEl.addEventListener('click', function (e) { if (e.target.closest('[data-m="quit"]')) endMission(false); });
  }
  var hint = null;         // { key, text }: what the coach says when it cannot do the step itself
  function finishStory() {
    var s = storyDef(story.id), done = lsGet(DONE) || {};
    done[s.id] = 1; lsSet(DONE, done);
    storyEvent(s.id, 'completed');
    WB.track('terminó la historia «' + s.title + '»');
    story.end = true; saveStory(); endCoach(); renderBar();
    endCard(s);
  }
  function endCard(s) {
    var el = layer('<h2 id="sh-ph">Terminaste «' + esc(s.title) + '»</h2><p>¿Se entendió?</p><div class="sh-actions" style="justify-content:flex-start" role="group" aria-label="¿Se entendió?">'
      + '<button type="button" class="sh-a" data-e="up" aria-pressed="false">👍 Sí</button><button type="button" class="sh-a" data-e="down" aria-pressed="false">👎 No mucho</button></div>'
      + '<div data-e-more hidden><label class="sh-note" for="sh-e-text">¿Qué te confundió?</label><textarea id="sh-e-text" maxlength="1000" style="width:100%;min-height:80px;margin-top:6px;padding:10px;border-radius:12px;border:1px solid var(--wb-border-default);background:var(--wb-surface-input);color:var(--wb-text-primary);font:16px/1.4 var(--sh-font)" placeholder="Por ejemplo: no supe qué era «apartar»."></textarea>'
      + '<div class="sh-actions"><button type="button" class="sh-a primary" data-e="send">Enviar</button></div></div>'
      + '<div class="sh-actions"><button type="button" class="sh-a" data-e="skip">Saltar</button><button type="button" class="sh-a" data-e="stories">Ver historias</button></div>', { name: 'end' });
    panel = 'end';
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-e]'); if (!b) return;
      var k = b.getAttribute('data-e');
      var thanks = function () { el.innerHTML = '<h2 id="sh-ph">Gracias</h2><p>Lo leemos todo.</p><div class="sh-actions"><button type="button" class="sh-a" data-e="free">Explorar libre</button><button type="button" class="sh-a primary" data-e="stories">Ver historias</button></div>'; };
      if (k === 'up') { if (window.WBComments) window.WBComments.thumbs(s.id, 'up', null).then(thanks); else thanks(); }
      else if (k === 'down') { b.setAttribute('aria-pressed', 'true'); el.querySelector('[data-e-more]').hidden = false; el.querySelector('#sh-e-text').focus(); }
      else if (k === 'send') { var tx = el.querySelector('#sh-e-text').value; if (window.WBComments) window.WBComments.thumbs(s.id, 'down', tx).then(thanks); else thanks(); }
      else if (k === 'stories') { story = null; saveStory(); openPanel('stories'); }
      else if (k === 'skip' || k === 'free') { story = null; saveStory(); closePanel(); }
    });
  }

  /* ==========================================================================
     Boot
     ========================================================================== */
  WB.ready(function () {
    applyShellTheme();
    WB.subscribe(function (ev) { if (ev.type === 'theme' || ev.type === 'external' || ev.type === 'reset') applyShellTheme(); if (ev.type !== 'screen') renderBar(); });
    var h = location.hash.slice(1), start;
    if (h) { var i = h.indexOf('?'); start = { id: i < 0 ? h : h.slice(0, i), params: i < 0 ? {} : paramsOf(h.slice(i + 1)) }; }
    else start = defaultScreen(prefs.area);
    renderBar(); open(start.id, start.params);
    renderCoach(); renderMission();
    WB.subscribe(function () { checkMission(); });
    if (!prefs.welcomeSeen) openPanel('welcome');
    setTimeout(mineRefresh, 1500);   // «Mis comentarios»: what changed since the last visit
    window.addEventListener('resize', function () { layout(); renderBar(); drawMarks(); drawRing(); placeCoach(null); });
    if (window.visualViewport) ['resize', 'scroll'].forEach(function (k) { window.visualViewport.addEventListener(k, function () { syncOver(); }); });
    if (window.ResizeObserver) new ResizeObserver(function () { syncOver(); }).observe(stage);
    stage.addEventListener('scroll', function () { syncOver(); drawMarks(); drawRing(); });
  });

  /* what comments.js needs from the shell */
  window.WBShell._ = {
    frame: function () { return frame; }, fdoc: fdoc, fwb: fwb, over: function () { return over; }, rectOf: rectOf, scale: scale, frameRect: frameRect,
    current: function () { return current; }, here: here, toast: toast, renderBar: renderBar, closePanel: closePanel, syncOver: syncOver,
    story: function () { if (!story) return null; return { id: story.id, step: story.n }; }, situation: function () { var s = ssGet(SIT); return s ? s.id : null; },
    device: function () { return areaOf(current.id) === 'biz' ? 'desktop' : isPhoneVisitor() ? 'phone-visitor' : prefs.device + (isLandscape() ? '-landscape' : ''); },
    context: frameContext, contextName: contextName, viewAsLabel: viewAsLabel, panel: function () { return panel; }, drawRing: drawRing, drawMarks: drawMarks, ico: ico, esc: esc,
    mineRefresh: mineRefresh,
    applySituation: applySituation   // tools/replay.mjs: a comment's «¿Qué pasa si…?»
  };
})();
