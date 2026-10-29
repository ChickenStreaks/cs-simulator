/* ==========================================================================
   «Comentar»: tap any element of the screen, write, send. Every comment carries what is needed to understand it
   alone: the screen and its state, the element (data-od-id, path, name) and the pin; the viewport, theme, scenario,
   «Ver como» person and role, simulated time, story and step, situation; the build; the last actions (WB.trail) and
   console errors; a JPEG screenshot (html-to-image 1.11.13, vendored) with the pin drawn on it.
   Never lose a comment: on failure the text stays with «Reintentar» (and in sessionStorage across a reload).
   API: POST /api/comments (server/comments.mjs locally; server/cloudflare/ later).
   ========================================================================== */
(function () {
  'use strict';
  var WB = window.WB, S = window.WBShell._;
  var esc = S.esc, ico = S.ico;
  var SHOT_MAX = 360 * 1024, SHOT_WAIT = 12000, SEND_TIMEOUT = 20000, ERR_MAX = 10;
  // an image the capture cannot fetch (an outside image that answers without CORS) is drawn as a soft
  // disc; without it html-to-image leaves the image empty, the empty src points at the page, and the whole capture fails
  var SHOT_HOLE = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#8a8f98" fill-opacity=".35"/></svg>');
  var DRAFT = 'wb-shell/draft', PINS = 'wb-shell/pins';
  function ssGet(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } }
  function ssSet(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* ---------- the API client ---------- */
  function call(method, url, body) {
    var init = { method: method, credentials: 'same-origin', redirect: 'manual', headers: { Accept: 'application/json' } };
    if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    var ac = typeof AbortController === 'function' ? new AbortController() : null, t = null;
    if (ac) { init.signal = ac.signal; t = setTimeout(function () { ac.abort(); }, SEND_TIMEOUT); }
    return fetch(url, init).then(function (r) {
      clearTimeout(t);
      if (r.type === 'opaqueredirect' || r.status === 401) return { ok: false, status: 401, error: 'session' };
      if (r.status === 204) return { ok: true, status: 204 };
      return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, data: d, error: r.ok ? null : (d && d.error) || 'http_' + r.status }; });
    }, function () { clearTimeout(t); return { ok: false, status: 0, error: 'network' }; });
  }
  var API = {
    comment: function (p) { return call('POST', '/api/comments', p); },
    storyEvent: function (story, event, step) { return call('POST', '/api/story-event', step ? { story: story, event: event, step: step } : { story: story, event: event }); },
    mine: function () { return call('GET', '/api/comments/mine'); }
  };

  /* ---------- console errors (shell and screen), for the runtime ---------- */
  var errs = [], errTotal = 0;
  function pushErr(where, msg) {
    errTotal++;
    var line = new Date().toISOString().slice(11, 19) + 'Z ' + where + ': ' + String(msg).replace(/\s+/g, ' ').slice(0, 180);
    if (errs.length < 5) errs.push(line); else { errs[5] = line; errs.length = Math.min(errs.length, ERR_MAX); }
  }
  function hookErrors(w, where) {
    try {
      if (w.__wbErrHooked) return; w.__wbErrHooked = true;
      w.addEventListener('error', function (e) { pushErr(where, e.message || (e.target && e.target.src ? 'no cargó ' + e.target.src : 'error')); }, true);
      w.addEventListener('unhandledrejection', function (e) { pushErr(where, (e.reason && e.reason.message) || e.reason); });
      var ce = w.console.error.bind(w.console);
      w.console.error = function () { pushErr(where, [].map.call(arguments, function (a) { return a && a.message ? a.message : typeof a === 'string' ? a : JSON.stringify(a); }).join(' ')); return ce.apply(null, arguments); };
    } catch (e) {}
  }
  hookErrors(window, 'simulador');

  /* ---------- naming what was tapped ---------- */
  var TAGS = { button: 'botón', a: 'enlace', img: 'imagen', svg: 'imagen', input: 'campo', textarea: 'campo', select: 'lista', p: 'texto', span: 'texto', li: 'renglón', h1: 'título', h2: 'título', h3: 'título', section: 'sección' };
  var LABELS = 'label, legend, h1, h2, h3, h4, h5, h6, dt';
  function seen(n) { var c = n.cloneNode(true); [].forEach.call(c.querySelectorAll('.sr-only, .visually-hidden, [hidden], script, style, template, svg'), function (e) { e.remove(); }); return c.textContent; }
  function nameOf(a) {
    if (!a || !a.getAttribute) return '';
    var d = a.ownerDocument, t = a.getAttribute('aria-label') || a.getAttribute('data-wb-label');
    if (!t && a.getAttribute('aria-labelledby')) t = a.getAttribute('aria-labelledby').split(/\s+/).map(function (i) { var l = d.getElementById(i); return l ? l.textContent : ''; }).join(' ');
    if (!t && a.id) { var l = d.querySelector('label[for="' + a.id.replace(/"/g, '') + '"]'); if (l) t = l.textContent; }
    if (!t && /^(INPUT|TEXTAREA)$/.test(a.tagName)) t = a.getAttribute('placeholder');
    var k = !t && (a.matches(LABELS) ? a : a.querySelector(LABELS));
    if (k) { var dd = k.tagName === 'DT' && k.nextElementSibling && k.nextElementSibling.tagName === 'DD' ? k.nextElementSibling : null; t = seen(k) + (dd ? ' ' + seen(dd) : ''); }
    if (!t || !t.trim()) t = seen(a);
    t = String(t || '').replace(/\s+/g, ' ').trim().replace(/(^| )(\S+)( \2)+(?= |$)/g, '$1$2');
    if (t) return t.length > 40 ? t.slice(0, 40).trim() + '…' : t;
    var tag = a.tagName.toLowerCase(); return TAGS[tag] || (/^h\d$/.test(tag) ? 'título' : 'elemento');
  }
  function anchorOf(el) { return el.closest('[data-od-id]') || el; }
  function pathFrom(a, el) {
    var parts = [];
    for (var n = el; n && n !== a && n.nodeType === 1 && parts.length < 6; n = n.parentElement) {
      var s = n.tagName.toLowerCase(); if (n.id) s += '#' + n.id; else if (n.classList.length) s += '.' + n.classList[0];
      parts.unshift(s);
    }
    var head = a.getAttribute('data-od-id') ? '[data-od-id="' + a.getAttribute('data-od-id') + '"]' : a.tagName.toLowerCase();
    return (parts.length ? head + ' > ' + parts.join(' > ') : head).slice(0, 512);
  }

  /* ---------- pick mode ---------- */
  var picking = false, hoverEl = null, form = null;
  function elAt(cx, cy) {
    var d = S.fdoc(); if (!d) return null;
    var f = S.frameRect(), s = S.scale();
    var e = d.elementFromPoint((cx - f.left) / s, (cy - f.top) / s);
    return e && e !== d.documentElement && e !== d.body ? e : e;
  }
  function start() {
    closeForm(true); picking = true; S.renderBar(); S.drawRing();
    var z = document.createElement('div'); z.className = 'sh-pick'; z.setAttribute('data-testid', 'sh-pick');
    z.setAttribute('aria-label', 'Toca lo que quieras comentar');
    S.over().appendChild(z);
    z.addEventListener('mousemove', function (e) { hover(elAt(e.clientX, e.clientY)); });
    z.addEventListener('click', function (e) { var el = elAt(e.clientX, e.clientY); if (el) choose(el, e.clientX, e.clientY); });
    WB.track('abrió «Comentar»');
    var c = document.querySelector('[data-sh="cancel-pick"]'); if (c) c.focus();
  }
  function stop() { if (!picking) return; picking = false; var z = S.over().querySelector('.sh-pick'); if (z) z.remove(); hover(null); S.renderBar(); S.drawRing(); }
  function hover(el) {
    var over = S.over(), h = over.querySelector('.sh-hover');
    if (!el) { if (h) h.remove(); hoverEl = null; return; }
    var a = anchorOf(el); if (a === hoverEl && h) return; hoverEl = a;
    if (!h) { h = document.createElement('div'); h.className = 'sh-hover'; h.setAttribute('aria-hidden', 'true'); over.appendChild(h); }
    var r = S.rectOf(a);
    h.style.left = r.x + 'px'; h.style.top = r.y + 'px'; h.style.width = r.w + 'px'; h.style.height = r.h + 'px';
    h.innerHTML = '<b>' + esc(nameOf(a)) + '</b>';
  }
  function where() {
    var h = S.here(), id = h.screen || 'unknown';
    if (/^unknown:/.test(id) || !WB.index.screens[id]) id = String(id).slice(0, 64);
    return { screen: id, state: String(h.state || 'default').slice(0, 64) };
  }
  function choose(el, cx, cy) {
    var a = anchorOf(el), r = S.rectOf(a), o = S.over().getBoundingClientRect();
    var px = r.w ? (cx - o.left - r.x) / r.w : 0.5, py = r.h ? (cy - o.top - r.y) / r.h : 0.5;
    var w = where();
    var c = { screen: w.screen, state: w.state, label: nameOf(a).slice(0, 120), el: a,
      selector: a.getAttribute('data-od-id') ? '[data-od-id="' + a.getAttribute('data-od-id') + '"]' : null, path: pathFrom(a, el),
      pin: { x: Math.min(1, Math.max(0, px)), y: Math.min(1, Math.max(0, py)) } };
    stop(); openForm(c);
    // the screenshot starts now, once the form is painted: it shows what was tapped and runs while they type
    c.shot = new Promise(function (res) { requestAnimationFrame(function () { setTimeout(function () { res(screenshot(c)); }, 0); }); });
  }
  // «Responder» from «Ver lo por decidir»: a comment about an open question (on its marker when there is one)
  function answer(question, el) {
    closeForm(true); stop();
    var w = where(), a = el ? anchorOf(el) : null;
    var c = { screen: w.screen, state: w.state, label: ('Por decidir: ' + question).slice(0, 120), el: a,
      selector: a && a.getAttribute('data-od-id') ? '[data-od-id="' + a.getAttribute('data-od-id') + '"]' : null, path: a ? pathFrom(a, a) : 'por-decidir',
      pin: { x: 0.5, y: 0.5 }, question: question };
    S.closePanel(); openForm(c);
    c.shot = new Promise(function (res) { requestAnimationFrame(function () { setTimeout(function () { res(screenshot(c)); }, 0); }); });
  }

  // «Sigue igual» from «Mis comentarios» (inspiration idea 3): a new comment on the same element, sent with reply_to; the AI
  // that listens reads it as the earlier comment reopened. No new status.
  function reopen(prev) {
    closeForm(true); stop();
    var w = where(), d = S.fdoc(), a = null;
    try { a = prev.el_selector && d ? d.querySelector(prev.el_selector) : null; } catch (e) {}
    if (a) a = anchorOf(a);
    var c = { screen: w.screen, state: w.state, label: (prev.el_label || prev.text || 'esta pantalla').slice(0, 120), el: a,
      selector: a && a.getAttribute('data-od-id') ? '[data-od-id="' + a.getAttribute('data-od-id') + '"]' : (prev.el_selector || null), path: a ? pathFrom(a, a) : 'sigue-igual',
      pin: { x: 0.5, y: 0.5 }, replyTo: prev.id };
    S.closePanel(); openForm(c);
    c.shot = new Promise(function (res) { requestAnimationFrame(function () { setTimeout(function () { res(screenshot(c)); }, 0); }); });
  }

  /* ---------- the form (popover on desktop; on a phone a bottom sheet above the keyboard) ---------- */
  function sheetMode() { return window.innerWidth < 640; }
  function openForm(c, err, session) {
    closeForm(true);
    var pins = ssGet(PINS) || [], num = pins.filter(function (p) { return p.screen === c.screen && p.state === c.state; }).length + 1;
    var draft = ssGet(DRAFT);
    var text = draft && draft.key === key(c) ? draft.text : '';
    form = { c: c, num: num, session: !!session, err: err || null };
    var f = document.createElement('section');
    f.className = 'sh-cform' + (sheetMode() ? ' sheet' : '');
    f.setAttribute('role', 'dialog'); f.setAttribute('aria-modal', 'false'); f.setAttribute('aria-labelledby', 'sh-c-h'); f.setAttribute('data-testid', 'sh-comment-form');
    f.innerHTML = '<div class="head"><h2 id="sh-c-h">' + (c.replyTo ? 'Sigue igual' : 'Comentar esto') + '</h2><button type="button" class="sh-x" data-f="cancel" aria-label="Cancelar comentario">' + ico('x') + '</button></div>'
      + '<p class="sh-target">' + ico('comment') + '<span data-testid="sh-comment-target">«' + esc(c.label) + '»</span></p>'
      + '<label class="sh-sr" for="sh-c-text">Tu comentario</label><textarea id="sh-c-text" maxlength="1000" placeholder="' + (c.replyTo ? '¿Qué sigue pasando?' : '¿Qué no se entiende o qué cambiarías?') + '" data-testid="sh-comment-text">' + esc(text) + '</textarea>'
      + '<p class="sh-alert" role="alert"' + (err ? '' : ' hidden') + ' data-testid="sh-comment-alert">' + esc(err || '') + '</p>'
      + '<p class="meta">Va con una captura de esta pantalla.</p>'
      + '<div class="sh-actions"><button type="button" class="sh-a" data-f="cancel">Cancelar</button><button type="button" class="sh-a primary" data-f="send" data-testid="sh-comment-send"></button></div>';
    document.body.appendChild(f);
    form.node = f;
    drawFormPin();
    place();
    var ta = f.querySelector('textarea'), b = f.querySelector('[data-f="send"]');
    var sync = function () {
      ssSet(DRAFT, ta.value ? { key: key(c), text: ta.value } : null);
      if (b.getAttribute('aria-busy') === 'true') return;
      var empty = !ta.value.trim();
      b.disabled = empty && !session;
      b.textContent = session ? 'Recargar la página' : empty ? 'Escribe tu comentario' : (err ? 'Reintentar' : 'Enviar');
    };
    ta.addEventListener('input', sync); sync();
    f.addEventListener('click', function (e) { var k = e.target.closest('[data-f]'); if (!k) return; if (k.getAttribute('data-f') === 'cancel') { closeForm(false); WB.track('canceló un comentario'); } else send(); });
    ta.focus({ preventScroll: true });
  }
  function key(c) { return c.screen + '|' + c.state + '|' + (c.selector || c.path); }
  function place() {
    if (!form) return;
    var f = form.node, vv = window.visualViewport;
    if (sheetMode()) {
      // anchored to the visual viewport: «Enviar» stays above the iPhone keyboard
      var top = vv ? vv.offsetTop + vv.height - f.offsetHeight : window.innerHeight - f.offsetHeight;
      f.style.top = Math.max(0, top) + 'px'; f.style.left = '0px'; f.style.bottom = 'auto';
      return;
    }
    var fr = S.frameRect(), w = f.offsetWidth, h = f.offsetHeight, vw = window.innerWidth, vh = window.innerHeight, x, y;
    var r = form.c.el && form.c.el.isConnected ? S.rectOf(form.c.el) : null;
    var ay = r ? fr.top + r.y : fr.top + 80;
    if (fr.right + 16 + w <= vw - 8) x = fr.right + 16;
    else if (fr.left - 16 - w >= 8) x = fr.left - 16 - w;
    else x = Math.max(8, Math.min(vw - w - 8, (r ? fr.left + r.x : fr.left)));
    y = Math.max(60, Math.min(vh - h - 12, ay));
    f.style.left = Math.round(x) + 'px'; f.style.top = Math.round(y) + 'px';
  }
  if (window.visualViewport) ['resize', 'scroll'].forEach(function (k) { window.visualViewport.addEventListener(k, place); });
  window.addEventListener('resize', function () { if (form) { form.node.classList.toggle('sheet', sheetMode()); place(); drawFormPin(); } });
  function drawFormPin() {
    var over = S.over(), old = over.querySelector('.sh-pin.draft'); if (old) old.remove();
    if (!form || !form.c.el || !form.c.el.isConnected) return;
    var r = S.rectOf(form.c.el), p = document.createElement('div');
    p.className = 'sh-pin draft'; p.setAttribute('aria-hidden', 'true'); p.textContent = form.num;
    p.style.left = (r.x + form.c.pin.x * r.w) + 'px'; p.style.top = (r.y + form.c.pin.y * r.h) + 'px';
    over.appendChild(p);
  }
  function closeForm(keepDraft) {
    if (!form) return;
    form.node.remove(); var p = S.over().querySelector('.sh-pin.draft'); if (p) p.remove();
    form = null; if (!keepDraft) ssSet(DRAFT, null);
  }

  /* ---------- sending ---------- */
  function context() {
    var p = WB.viewAs.person(), ctx = S.context(), ctxId = ctx ? (ctx.kid || null) : null;
    var st = S.story(), m = document.querySelector('meta[name="wb-sim-build"]');
    return { theme: WB.theme.get(), device: S.device(), scenario: WB.scenario.current(),
      view_as: { person: p ? p.id : null, name: p ? p.name : null, role: WB.role(p && p.id, ctx) || null, context: ctxId },
      sim_time: WB.clock.iso(), story: st ? st.id : null, step: st ? st.step : null, situation: S.situation(), build: m ? m.content : null,
      // the exact moment, so «Ver» and sim-comments.py replay reopen it (inspiration idea 1)
      params: (S.current() || {}).params || {}, clock_offset_ms: Math.round((Date.parse(WB.clock.iso()) - Date.now()) / 60000) * 60000 };
  }
  function runtime() {
    try {
      var cur = S.current(), fr = S.frame(), h = S.here(), sess = WB.session.get(), ctx = S.context();
      var screenUrl = null; try { screenUrl = fr.contentWindow.location.pathname + fr.contentWindow.location.search; } catch (e) {}
      return { v: 1, url: { shell: location.pathname + location.hash, screen: screenUrl },
        view: { screen: h.screen, state: h.state, params: cur.params }, area: /^biz\./.test(cur.id || '') ? 'biz' : 'app',
        scenario: WB.scenario.current(), view_as: { person: WB.viewAs.get().person, context: S.contextName(ctx) }, sim_time: WB.clock.format(),
        session: { signed_in: !!sess.signedIn, person: sess.person }, situation: S.situation(), panel: S.panel(),
        actions: WB.trail(), errors: errs.slice(0, ERR_MAX), errors_total: errTotal };
    } catch (e) { return { v: 1, error: 'runtime: ' + (e && e.message) }; }
  }
  function send() {
    var f = form; if (!f) return;
    var ta = f.node.querySelector('textarea'), b = f.node.querySelector('[data-f="send"]'), text = ta.value;
    if (f.session) { location.reload(); return; }
    if (!text.trim()) return;
    b.setAttribute('aria-busy', 'true'); b.setAttribute('aria-disabled', 'true'); b.textContent = 'Enviando…'; ta.readOnly = true;
    var c = f.c;
    (c.shot || (c.shot = screenshot(c))).then(function (shot) {
      var payload = { kind: 'pin', screen: c.screen, state: c.state, element: { selector: c.selector, path: c.path, label: c.label }, pin: c.pin,
        viewport: { w: window.innerWidth, h: window.innerHeight, dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100 },
        context: context(), runtime: runtime(), text: text, client_ts: new Date().toISOString().replace(/\.\d+Z$/, 'Z') };
      if (shot.data) payload.screenshot = shot.data; else payload.screenshot_error = shot.error;
      if (c.replyTo) payload.reply_to = c.replyTo;   // «Sigue igual»: it reopens that comment
      return API.comment(payload);
    }).then(function (r) {
      if (form !== f) return;
      if (r.ok) {
        var pins = ssGet(PINS) || []; pins.push({ screen: c.screen, state: c.state, selector: c.selector, pin: c.pin }); ssSet(PINS, pins);
        closeForm(false); drawPins();
        S.toast('Enviado. Gracias por tu comentario.');
        WB.track('envió un comentario');
        if (S.mineRefresh) S.mineRefresh();   // «Mis comentarios» shows it right away
        return;
      }
      ssSet(DRAFT, { key: key(c), text: text });
      if (r.status === 401) return openForm(c, 'Tu sesión se cerró. Recarga la página para entrar de nuevo; tu texto se guarda.', true);
      openForm(c, r.status === 429 ? 'Vas muy rápido; intenta en un minuto.' : 'No se pudo enviar. Tu texto sigue aquí.');
    });
  }
  function thumbs(story, t, text, replyTo) {
    var w = where(), p = { kind: 'story_end', screen: w.screen, state: w.state, thumbs: t, text: text || null, context: Object.assign(context(), { story: story, step: null }), runtime: runtime(), client_ts: new Date().toISOString().replace(/\.\d+Z$/, 'Z') };
    if (replyTo) p.reply_to = replyTo;   // a mission's answer, after its report
    return API.comment(p);
  }

  /* ---------- sent pins of this visit, on their screen ---------- */
  function drawPins() {
    var over = S.over(); [].forEach.call(over.querySelectorAll('.sh-pin.sent'), function (p) { p.remove(); });
    var d = S.fdoc(), w = where(); if (!d) return;
    (ssGet(PINS) || []).forEach(function (p, i) {
      if (p.screen !== w.screen || p.state !== w.state || !p.selector) return;
      var el = d.querySelector(p.selector); if (!el) return;
      var r = S.rectOf(el), n = document.createElement('div');
      n.className = 'sh-pin sent'; n.setAttribute('aria-hidden', 'true'); n.textContent = '✓'; n.setAttribute('data-testid', 'sh-pin');
      n.style.left = (r.x + p.pin.x * r.w) + 'px'; n.style.top = (r.y + p.pin.y * r.h) + 'px';
      over.appendChild(n);
    });
  }

  /* ---------- what was on screen: a phone screen scrolls inside itself, and html-to-image clones every scroller at its
     top — the picture showed the top of Inicio with the pin over another card. For the capture, each scrolled box shows
     the same content through a transform on its children at scroll 0 (sticky and fixed children stay put, transitions
     wait); the scroll events this makes are held back, so the screen's own scroll handlers never notice. → restore() */
  function unscroll(w, d) {
    var undo = [], hold = function (e) { e.stopImmediatePropagation(); };
    w.addEventListener('scroll', hold, true);
    [].forEach.call(d.querySelectorAll('*'), function (el) {
      var t = el.scrollTop, l = el.scrollLeft; if (!t && !l) return;
      var kids = [].filter.call(el.children, function (k) { var pos = w.getComputedStyle(k).position; return pos !== 'sticky' && pos !== 'fixed'; });
      var was = kids.map(function (k) { return [k.style.transform, k.style.transition]; });
      kids.forEach(function (k) {
        var cur = w.getComputedStyle(k).transform;
        k.style.transition = 'none';
        k.style.transform = 'translate(' + (-l) + 'px,' + (-t) + 'px)' + (cur && cur !== 'none' ? ' ' + cur : '');
      });
      el.scrollTop = 0; el.scrollLeft = 0;
      undo.push(function () { kids.forEach(function (k, i) { k.style.transform = was[i][0]; k.style.transition = was[i][1]; }); el.scrollTop = t; el.scrollLeft = l; });
    });
    var done = false;
    return function () {
      if (done) return; done = true;
      undo.reverse().forEach(function (f) { f(); });
      w.requestAnimationFrame(function () { w.requestAnimationFrame(function () { w.removeEventListener('scroll', hold, true); }); });
    };
  }

  /* ---------- the screenshot: html-to-image inside the screen's document, JPEG ≤ 360 KB, the pin drawn ---------- */
  function screenshot(c) {
    var fr = S.frame(), w = fr.contentWindow, d = S.fdoc();
    if (!d || !w) return Promise.resolve({ error: 'no_screen' });
    var lib = new Promise(function (res, rej) {
      if (w.htmlToImage) return res(w.htmlToImage);
      var s = d.createElement('script'); s.src = '/simulator/vendor/html-to-image-1.11.13.js';
      s.onload = function () { res(w.htmlToImage); }; s.onerror = function () { rej(new Error('lib')); };
      d.head.appendChild(s);
    });
    var W = w.innerWidth, H = w.innerHeight, ratio = Math.min(1, 1600 / Math.max(W, H)) * Math.min(2, w.devicePixelRatio || 1);
    var pinAt = null;
    if (c && c.el && c.el.isConnected) { var r = c.el.getBoundingClientRect(); pinAt = { x: r.left + c.pin.x * r.width, y: r.top + c.pin.y * r.height }; }
    var restore = function () {};
    var work = lib.then(function (h) {
      restore = unscroll(w, d);
      var bg = w.getComputedStyle(d.body).backgroundColor;
      if (!bg || bg === 'rgba(0, 0, 0, 0)') bg = w.getComputedStyle(d.documentElement).backgroundColor;
      return h.toCanvas(d.documentElement, { width: W, height: H, pixelRatio: ratio, cacheBust: false, skipFonts: true, imagePlaceholder: SHOT_HOLE,
        backgroundColor: bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : '#ffffff',
        style: { marginTop: (-w.scrollY) + 'px', marginLeft: (-w.scrollX) + 'px' },
        filter: function (n) { return n.tagName !== 'SCRIPT'; } });
    }).then(function (cv) {
      restore();
      if (pinAt) {   // the pin, where it was tapped
        var g = cv.getContext('2d'), k = cv.width / W, x = pinAt.x * k, y = pinAt.y * k, rr = 13 * k;
        g.save(); g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fillStyle = '#4868fa'; g.fill(); g.lineWidth = 3 * k; g.strokeStyle = '#ffffff'; g.stroke(); g.restore();
      }
      var scale = Math.min(1, 1600 / Math.max(cv.width, cv.height));
      for (var tries = 0; tries < 8; tries++) {
        var out = document.createElement('canvas'); out.width = Math.round(cv.width * scale); out.height = Math.round(cv.height * scale);
        out.getContext('2d').drawImage(cv, 0, 0, out.width, out.height);
        for (var qi = 0; qi < 3; qi++) {
          var data = out.toDataURL('image/jpeg', [0.7, 0.55, 0.4][qi]);
          if (Math.floor((data.length - 23) * 3 / 4) <= SHOT_MAX) return { data: data };
        }
        scale *= 0.75;
      }
      return { error: 'too_large' };
    });
    var timeout = new Promise(function (res) { setTimeout(function () { res({ error: 'timeout' }); }, SHOT_WAIT); });
    // the cause goes with the comment (its runtime errors), so whoever reads it knows why there is no picture
    work.catch(function () { restore(); });
    return Promise.race([work, timeout]).catch(function (e) {
      var t = e && e.target, why = t && t.tagName ? 'no cargó ' + t.tagName.toLowerCase() + ' ' + String(t.src || (t.href && t.href.baseVal) || '').slice(0, 80) : (e && e.message) || String(e);
      pushErr('captura', why);
      return { error: 'render_failed' };
    });
  }

  window.WBComments = {
    start: start, stop: stop, answer: answer, picking: function () { return picking; }, formOpen: function () { return !!form; },
    nameOf: nameOf, thumbs: thumbs,
    storyEvent: function (id, ev, step) { return API.storyEvent(id, ev, step); }, reopen: reopen,
    mine: function () { return API.mine(); }, shotUrl: function (id) { return '/api/comments/' + encodeURIComponent(id) + '/shot'; },
    escape: function () { if (picking) { stop(); return true; } if (form) { closeForm(true); return true; } return false; },
    frameLoaded: function (w) { hookErrors(w, 'pantalla'); closeForm(true); setTimeout(drawPins, 50); },
    reset: function () { stop(); closeForm(false); ssSet(PINS, null); ssSet(DRAFT, null); errs = []; errTotal = 0; drawPins(); }
  };
})();
