/* ==========================================================================
   ChickenStreaks simulator · logic/family.js — the daily loop: a parent assigns chores, a kid marks them, an adult
   approves; eggs, streaks and the hen follow (flows/daily-loop.md, flows/prizes.md). The rules are CSCore
   (logic/family-core.js); this file only reads the world, writes records and draws the screens by data-od-id.
   ========================================================================== */
(function () {
  'use strict';
  var C = window.CSCore;
  var HOUR = 3600e3;
  var WEEK = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  var WEEKDAY = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var HEN = { pollito: { emoji: '🐣', name: 'pollito' }, pollita: { emoji: '🐥', name: 'pollita' }, gallina: { img: true, name: 'gallina' }, dorada: { img: true, name: 'gallina dorada' } };
  // tareas R11: praise that describes what the kid did
  var PRAISE = ['Sin que se lo pidieran', 'Se esforzó', 'Lo terminó completo'];
  // tareas R3, huevos R2: suggestions by age, with their starting value (fácil 5, media 10, difícil 20)
  var SUGGEST = {
    '4-6': [['🧸', 'Recoger sus juguetes', 5], ['👟', 'Guardar sus zapatos', 5], ['🪥', 'Lavarse los dientes', 5]],
    '7-9': [['🛏️', 'Tender su cama', 5], ['🍽️', 'Poner la mesa', 10], ['🐶', 'Darle de comer al perro', 10]],
    '10-12': [['🗑️', 'Sacar la basura', 10], ['📚', 'Hacer la tarea', 10], ['🧺', 'Doblar su ropa', 20]],
    '13+': [['🍳', 'Preparar el desayuno', 20], ['🧹', 'Barrer la cocina', 10], ['🚲', 'Lavar la bici', 20]]
  };
  // tareas R4: words that ask «¿Es seguro para su edad?» — a note, never a block
  var RISK = /estufa|cuchill|medicin|químic|quimic|cloro|plancha|horno|fuego|cerillo|limpiador/i;

  /* ---------- designed states (catalog «drive»): a read-only preview of the world, never written ----------
     A state opened with ?estado= shows the world as that state needs it — another viewer, a changed copy — so a
     designer sees it without a scenario. What the visitor then does writes the real world as always. */
  var PREVIEW = {
    'app.today·all-approved': { world: approveAll },
    'app.approvals·empty': { world: approveAll },
    'app.chores·empty': { world: function (w) { w.chores = []; } },
    'app.kid·all-done': { world: function (w) { var t = WB.clock.day(); C.dueChores(w, 'p-sofia', t).forEach(function (c) { if (!C.markOf(w, 'p-sofia', c.id, t)) w.marks.push({ id: 'mk-preview-' + c.id, chore: c.id, kid: 'p-sofia', day: t, at: WB.clock.iso(), by: 'p-sofia', status: 'approved', eggs: c.eggs, approvedBy: 'p-mama', approvedAt: WB.clock.iso() }); }); } },
    'app.kid·missed': { world: function (w) { var y = WB.clock.day(-1); w.marks = w.marks.filter(function (m) { return !(m.kid === 'p-sofia' && m.day === y); }); } },
    'app.kid·rest': { world: function (w) { w.chores.forEach(function (c) { c.kids = c.kids.filter(function (k) { return k !== 'p-emi'; }); }); w.chores = w.chores.filter(function (c) { return c.kids.length; }); } },
    'app.kid·no-access': { as: 'p-mateo' },
    'app.prizes·to-deliver': { world: function (w) { w.redemptions.push({ id: 'rd-preview', prize: 'pz-sofia-peli', kid: 'p-sofia', name: 'Elegir la película del viernes', price: 60, at: WB.clock.iso(), status: 'to-deliver' }); } },
    'app.prizes·no-access': { as: 'p-mateo' },
    'app.hen·default': { as: 'p-sofia' },
    'app.streak·default': { as: 'p-sofia' },
    'app.hen·no-access': { as: 'p-mama' },
    'app.streak·no-access': { as: 'p-mama' }
  };
  ['app.today', 'app.approvals', 'app.chores', 'app.chore-new'].forEach(function (id) { PREVIEW[id + '·no-access'] = { as: 'p-sofia' }; });
  function approveAll(w) { w.marks.forEach(function (m) { if (m.status === 'pending') { m.status = 'approved'; m.approvedBy = 'p-papa'; m.approvedAt = WB.clock.iso(); m.eggs = 5; } }); }
  var pv = null;
  function preview(screen) { pv = PREVIEW[screen + '·' + WB.params.estado] || null; }
  // every read of this file goes through W(): the world, or its preview
  function W() { var w = WB.state.get(); if (pv && pv.world) pv.world(w); return w; }
  function list(col, f) { var l = W()[col] || []; return f ? l.filter(f) : l; }
  function byId(col, id) { return list(col).filter(function (x) { return x.id === id; })[0] || null; }

  /* ---------- helpers ---------- */
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function q(doc, id) { return doc.querySelector('[data-od-id="' + id + '"]'); }
  function today() { return WB.clock.day(); }
  function me() { return pv && pv.as ? byId('people', pv.as) : WB.viewAs.person(); }
  function isAdult() { var p = me(); return !!(p && p.role === 'adult'); }
  function person(id) { return byId('people', id); }
  function kids() { return list('people', function (p) { return p.role === 'kid' && !p.removedAt; }); }
  function who(id) { if (id === 'auto') return 'sola'; var p = person(id); return p ? (p.label || p.short || p.name) : '—'; }
  function newId(prefix) { return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function toast(doc, id, text) {
    var t = q(doc, id); if (!t) return;
    t.textContent = text; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function ago(iso) {
    var m = Math.round((WB.clock.now() - Date.parse(iso)) / 60e3);
    if (m < 1) return 'ahora'; if (m < 60) return 'hace ' + m + ' min';
    var h = Math.round(m / 60); return h < 24 ? 'hace ' + h + ' h' : 'hace ' + Math.round(h / 24) + ' d';
  }
  function daysText(days) {
    if (days.length === 7) return 'Diario';
    if (days.length === 5 && [1, 2, 3, 4, 5].every(function (d) { return days.indexOf(d) >= 0; })) return 'Lunes a viernes';
    return days.slice().sort().map(function (d) { return WEEK[d]; }).join(' ');
  }
  function kidOf() { var c = WB.context(); return c && c.kid ? person(c.kid) : null; }
  function tabs(doc, active) {
    [].forEach.call(doc.querySelectorAll('.tabs [data-go]'), function (b) {
      if (b.getAttribute('data-go') === active) b.setAttribute('aria-current', 'page');
      b.onclick = function () { WB.go(b.getAttribute('data-go')); };
    });
  }
  function adultOnly(doc, root) {
    if (isAdult()) return false;
    WB.ui.stateScreen(q(doc, root), { kind: 'no-access', title: 'Esto es para papás', text: 'Aquí aprueban y crean tareas los adultos.', primary: { label: 'Ir a mi día', go: 'app.kid' } });
    var t = q(doc, 'tabs'); if (t) t.hidden = true;
    WB.setScreenState('no-access');
    return true;
  }
  function pending() { return list('marks', function (m) { return m.status === 'pending'; }).sort(function (a, b) { return Date.parse(a.at) - Date.parse(b.at); }); }
  function choreOf(id) { return byId('chores', id) || { name: '—', icon: '✨', eggs: 0 }; }
  function render(doc, fn) { fn(); WB.state.subscribe(fn); }

  /* ---------- records (one place each, so every screen writes the same shape) ---------- */
  // tareas R6: a kid's mark waits for approval; an adult's mark, or a chore that approves itself (R10), is approved
  function mark(kidId, choreId) {
    var c = choreOf(choreId), by = me().id, now = WB.clock.iso(), approved = isAdult() || !!c.autoApprove;
    WB.state.update(function (w) {
      w.marks.push({ id: newId('mk'), chore: choreId, kid: kidId, day: today(), at: now, by: by, status: approved ? 'approved' : 'pending',
        eggs: approved ? c.eggs : null, approvedBy: approved ? (isAdult() ? by : 'auto') : null, approvedAt: approved ? now : null });
    }, (isAdult() ? 'marcó por ' + who(kidId) : 'marcó') + ' «' + c.name + '»');
  }
  function approve(ids, praise) {
    var by = me().id, now = WB.clock.iso();
    WB.state.update(function (w) {
      w.marks.forEach(function (m) {
        if (ids.indexOf(m.id) < 0 || m.status !== 'pending') return;   // familia R5: the first action wins
        var c = w.chores.find(function (x) { return x.id === m.chore; });
        m.status = 'approved'; m.approvedBy = by; m.approvedAt = now; m.eggs = c ? c.eggs : 0;   // huevos R1: eggs on approval
        if (praise && praise[m.id]) m.praise = praise[m.id];
      });
    }, ids.length > 1 ? 'aprobó ' + ids.length + ' tareas' : 'aprobó una tarea');
  }
  function redo(id) {
    WB.state.update(function (w) { var m = w.marks.find(function (x) { return x.id === id; }); if (m && m.status === 'pending') { m.status = 'redo'; m.redoBy = me().id; m.redoAt = WB.clock.iso(); } }, 'pidió repetir una tarea');
  }

  /* tareas R10: a mark pending 24 hours (configurable) approves itself — when the clock passes it */
  WB.clock.onAdvance('family:auto-approve', function (r) {
    var hours = Number((WB.state.get('settings') || {}).autoApproveHours || 24);
    WB.state.update(function (w) {
      w.marks.forEach(function (m) {
        var due = Date.parse(m.at) + hours * HOUR;
        if (m.status !== 'pending' || due > r.to.getTime()) return;
        var c = w.chores.find(function (x) { return x.id === m.chore; });
        m.status = 'approved'; m.approvedBy = 'auto'; m.approvedAt = new Date(due).toISOString(); m.eggs = c ? c.eggs : 0;
      });
    }, null);
  });

  /* ==========================================================================
     app.today — the parent's day: who did what, what waits
     ========================================================================== */
  WB.wire('app.today', function (WB, doc) {
    preview('app.today');
    tabs(doc, 'app.today');
    if (adultOnly(doc, 'today')) return;
    render(doc, function () {
      var w = W(), t = today(), n = pending().length;
      q(doc, 'today-title').textContent = 'Hola, ' + (me().short || me().name);
      q(doc, 'today-date').textContent = WB.clock.format(null, { weekday: 'long', day: 'numeric', month: 'long', hour: undefined, minute: undefined });
      var b = q(doc, 'today-pending');
      b.textContent = n ? 'Aprobar ' + n + (n === 1 ? ' tarea' : ' tareas') : 'Nada por aprobar';
      b.disabled = !n; b.onclick = function () { WB.go('app.approvals'); };
      var badge = q(doc, 'tab-approvals-count'); badge.hidden = !n; badge.textContent = n;
      q(doc, 'today-kids').innerHTML = kids().map(function (k) {
        var due = C.dueChores(w, k.id, t), done = due.filter(function (c) { return C.markOf(w, k.id, c.id, t); }).length;
        var s = C.streak(w, k.id, t), e = C.eggs(w, k.id, t), st = C.stage(w, k.id);
        var missed = [C.addDays(t, -1), C.addDays(t, -2)].some(function (d) { return C.canForgive(w, k.id, d, t); });
        return '<button type="button" class="row" style="border:0;text-align:left;cursor:pointer;width:100%" data-od-id="today-kid-' + k.id + '" data-kid="' + k.id + '">'
          + '<span class="icon" aria-hidden="true">' + (HEN[st.stage].emoji || '🐔') + '</span>'
          + '<span><h4>' + esc(k.name) + (k.paired ? '' : ' <span class="chip wait">sin teléfono</span>') + '</h4>'
          + '<span class="meta">' + (due.length ? done + ' de ' + due.length + ' hoy' : 'Hoy descansa') + ' · 🔥 ' + s.current + (s.current === 1 ? ' día' : ' días')
          + (missed ? ' · <span class="chip redo">Faltó un día</span>' : '') + '</span></span>'
          + '<span class="reward"><i class="egg sm"></i>' + e.balance + '</span></button>';
      }).join('');
      [].forEach.call(doc.querySelectorAll('[data-kid]'), function (el) { el.onclick = function () { WB.go('app.kid', { kid: el.getAttribute('data-kid') }); }; });
      WB.setScreenState(n ? 'default' : 'all-approved');
    });
  });

  /* ==========================================================================
     app.approvals — one inbox, «Aprobar todo», praise, «Repítela» (tareas R8–R12)
     ========================================================================== */
  WB.wire('app.approvals', function (WB, doc) {
    preview('app.approvals');
    tabs(doc, 'app.approvals');
    if (adultOnly(doc, 'approvals')) return;
    var praise = {};
    render(doc, function draw() {
      var waiting = pending(), t = today();
      q(doc, 'approvals-count').textContent = waiting.length ? waiting.length + (waiting.length === 1 ? ' tarea espera' : ' tareas esperan') : 'Todo al día';
      var badge = q(doc, 'tab-approvals-count'); badge.hidden = !waiting.length; badge.textContent = waiting.length;
      q(doc, 'approvals-all').hidden = waiting.length < 2;
      q(doc, 'approvals-all').onclick = function () { approve(waiting.map(function (m) { return m.id; }), praise); toast(doc, 'approvals-toast', 'Aprobaste ' + waiting.length + ' tareas'); };
      q(doc, 'approvals-list').innerHTML = waiting.map(function (m) {
        var c = choreOf(m.chore), k = person(m.kid);
        return '<div class="row" data-od-id="approval-' + m.id + '">'
          + '<span class="icon" aria-hidden="true">' + (c.icon || '✨') + '</span>'
          + '<span><h4>' + esc(k ? k.name : '') + ' · ' + esc(c.name) + '</h4><span class="meta">' + (m.day === t ? 'Hoy' : 'El ' + WEEKDAY[C.weekday(m.day)]) + ', ' + ago(m.at) + '</span></span>'
          + '<span class="reward"><i class="egg sm"></i>+' + c.eggs + '</span>'
          + '<div class="extra chips" role="group" aria-label="Elogio">' + PRAISE.map(function (p, i) {
            return '<button type="button" data-od-id="approval-praise-' + m.id + '-' + i + '" data-praise="' + m.id + '" aria-pressed="' + (praise[m.id] === p) + '">' + esc(p) + '</button>';
          }).join('') + '</div>'
          + '<div class="extra" style="justify-content:flex-end"><button type="button" class="btn soft" data-od-id="approval-redo-' + m.id + '" data-redo="' + m.id + '">Repetir</button>'
          + '<button type="button" class="btn" data-od-id="approval-ok-' + m.id + '" data-ok="' + m.id + '">Aprobar</button></div></div>';
      }).join('');
      var empty = q(doc, 'approvals-empty'); empty.hidden = !!waiting.length;
      if (!waiting.length) WB.ui.stateScreen(empty, { kind: 'empty', compact: true, icon: 'inbox', title: 'Todo está aprobado', text: 'Cuando tus hijos marquen tareas, llegan aquí.' });
      var done = list('marks', function (m) { return m.status === 'approved' && m.approvedAt && C.dayOf(m.approvedAt) === t; });
      q(doc, 'approvals-done-title').hidden = !done.length;
      q(doc, 'approvals-done').innerHTML = done.map(function (m) {
        var c = choreOf(m.chore), k = person(m.kid);
        return '<div class="row" data-od-id="approved-' + m.id + '"><span class="icon" aria-hidden="true">' + (c.icon || '✨') + '</span>'
          + '<span><h4>' + esc(k ? k.name : '') + ' · ' + esc(c.name) + '</h4><span class="meta"><span class="chip ok">' + (m.approvedBy === 'auto' ? 'Se aprobó sola' : 'Aprobada por ' + esc(who(m.approvedBy))) + '</span>'
          + (m.praise ? '«' + esc(m.praise) + '»' : '') + '</span></span><span class="reward"><i class="egg sm"></i>+' + (m.eggs || 0) + '</span></div>';
      }).join('');
      [].forEach.call(doc.querySelectorAll('[data-praise]'), function (b) {
        b.onclick = function () { var id = b.getAttribute('data-praise'), p = b.textContent; praise[id] = praise[id] === p ? null : p; draw(); };
      });
      [].forEach.call(doc.querySelectorAll('[data-ok]'), function (b) { b.onclick = function () { approve([b.getAttribute('data-ok')], praise); toast(doc, 'approvals-toast', 'Aprobada. Ya le llegaron sus huevos.'); }; });
      [].forEach.call(doc.querySelectorAll('[data-redo]'), function (b) { b.onclick = function () { redo(b.getAttribute('data-redo')); toast(doc, 'approvals-toast', 'Le pedimos que la repita, sin castigo.'); }; });
      WB.setScreenState(waiting.length ? 'default' : 'empty');
    });
  });

  /* ==========================================================================
     app.chores — the family's chores (tareas R1, R2)
     ========================================================================== */
  WB.wire('app.chores', function (WB, doc) {
    preview('app.chores');
    tabs(doc, 'app.chores');
    if (adultOnly(doc, 'chores')) return;
    q(doc, 'chores-new').onclick = function () { WB.go('app.chore-new'); };
    render(doc, function () {
      var chores = list('chores', function (c) { return !c.archivedAt; });
      q(doc, 'chores-count').textContent = chores.length + (chores.length === 1 ? ' tarea' : ' tareas');
      q(doc, 'chores-list').innerHTML = chores.map(function (c) {
        return '<div class="row" data-od-id="chore-' + c.id + '"><span class="icon" aria-hidden="true">' + (c.icon || '✨') + '</span>'
          + '<span><h4>' + esc(c.name) + '</h4><span class="meta">' + c.kids.map(function (k) { return esc(who(k)); }).join(', ') + ' · ' + daysText(c.days)
          + (c.autoApprove ? ' · <span class="chip ok">Se aprueba sola</span>' : '') + '</span></span>'
          + '<span class="reward"><i class="egg sm"></i>+' + c.eggs + '</span></div>';
      }).join('');
      if (!chores.length) WB.ui.stateScreen(q(doc, 'chores-list'), { kind: 'empty', compact: true, title: 'Aún no hay tareas', text: 'Crea la primera; te sugerimos algunas por edad.', primary: { label: 'Nueva tarea', go: 'app.chore-new' } });
      WB.setScreenState(chores.length ? 'default' : 'empty');
    });
  });

  /* ==========================================================================
     app.chore-new — an operation (WB.flow): it starts from Tareas (or a kid) and returns there
     ========================================================================== */
  WB.wire('app.chore-new', function (WB, doc) {
    preview('app.chore-new');
    if (adultOnly(doc, 'chore-new')) return;
    WB.flow.start('nueva tarea', { fallback: { id: 'app.chores' } });
    var f = { kids: WB.params.kid ? [WB.params.kid] : [], days: [0, 1, 2, 3, 4, 5, 6], icon: '✨', auto: false };
    var name = q(doc, 'chore-new-name'), eggs = q(doc, 'chore-new-eggs');
    eggs.value = 10;   // huevos R2: a chore the parent writes starts at 10
    q(doc, 'chore-new-back').onclick = function () { WB.flow.cancel(); };
    function draw() {
      q(doc, 'chore-new-kids').innerHTML = kids().map(function (k) { return '<button type="button" data-od-id="chore-new-kid-' + k.id + '" data-k="' + k.id + '" aria-pressed="' + (f.kids.indexOf(k.id) >= 0) + '">' + esc(k.name) + '</button>'; }).join('');
      var first = f.kids.length ? person(f.kids[0]) : null, sug = first ? SUGGEST[first.ageRange] || [] : [];
      q(doc, 'chore-new-suggested').innerHTML = sug.length ? sug.map(function (s, i) { return '<button type="button" data-od-id="chore-new-suggest-' + i + '" data-s="' + i + '">' + s[0] + ' ' + esc(s[1]) + '</button>'; }).join('') : '<span class="soft">Elige primero para quién.</span>';
      q(doc, 'chore-new-days').innerHTML = WEEK.map(function (d, i) { return '<button type="button" data-od-id="chore-new-day-' + i + '" data-d="' + i + '" aria-pressed="' + (f.days.indexOf(i) >= 0) + '" aria-label="' + WEEKDAY[i] + '">' + d + '</button>'; }).join('');
      q(doc, 'chore-new-auto').setAttribute('aria-pressed', f.auto);
      var risky = RISK.test(name.value);
      q(doc, 'chore-new-safety').hidden = !risky;
      var n = Number(eggs.value), ok = name.value.trim() && f.kids.length && f.days.length && Number.isInteger(n) && n >= 1 && n <= 50;
      q(doc, 'chore-new-save').disabled = !ok;
      [].forEach.call(doc.querySelectorAll('[data-k]'), function (b) { b.onclick = function () { var k = b.getAttribute('data-k'), i = f.kids.indexOf(k); if (i >= 0) f.kids.splice(i, 1); else f.kids.push(k); draw(); }; });
      [].forEach.call(doc.querySelectorAll('[data-d]'), function (b) { b.onclick = function () { var d = Number(b.getAttribute('data-d')), i = f.days.indexOf(d); if (i >= 0) f.days.splice(i, 1); else f.days.push(d); draw(); }; });
      [].forEach.call(doc.querySelectorAll('[data-s]'), function (b) { b.onclick = function () { var s = sug[Number(b.getAttribute('data-s'))]; f.icon = s[0]; name.value = s[1]; eggs.value = s[2]; draw(); }; });
      WB.setScreenState(risky ? 'safety' : 'default');
    }
    name.addEventListener('input', function () { f.icon = '✨'; draw(); });
    eggs.addEventListener('input', draw);
    q(doc, 'chore-new-auto').onclick = function () { f.auto = !f.auto; draw(); };
    q(doc, 'chore-new-save').onclick = function () {
      var c = { id: newId('ch'), name: name.value.trim(), icon: f.icon, kids: f.kids.slice(), days: f.days.slice().sort(), eggs: Number(eggs.value), autoApprove: f.auto, createdAt: WB.clock.iso(), by: me().id };
      WB.state.update(function (w) { w.chores.push(c); }, 'creó la tarea «' + c.name + '»');
      WB.audit('chore.create', c.id, { name: c.name });
      WB.flow.finish('creada'); WB.flow.exit();
    };
    WB.onState('safety', function () { name.value = 'Ayudar con la estufa'; draw(); });
    draw();
  });

  /* ==========================================================================
     app.kid — a kid's day: their phone, or an adult looking at it (and marking for a kid with no phone)
     ========================================================================== */
  // the hen's mood (gallina R5: asleep after 3 days without a mark, never sad; R7: she celebrates a day done); her art
  // is the screen's own (template hen-art)
  function henArt(doc, st, mood) { return doc.querySelector('[data-od-id="hen-art"]').content.querySelector('[data-stage="' + st + '"][data-mood="' + mood + '"]').getAttribute('src'); }
  function henMood(w, k, allDone) {
    var last = w.marks.filter(function (m) { return m.kid === k.id; }).map(function (m) { return m.at; }).sort().pop();
    return !last || WB.clock.now() - Date.parse(last) > 3 * 24 * HOUR ? 'sleep' : allDone ? 'party' : 'happy';
  }
  function drawHen(img, w, k, adult, allDone) {
    var st = C.stage(w, k.id).stage, mood = henMood(w, k, allDone);
    img.src = henArt(img.ownerDocument, st, mood);
    img.setAttribute('data-stage', st); img.setAttribute('data-mood', mood);
    img.alt = (adult ? 'Su ' : 'Tu ') + HEN[st].name + (mood === 'sleep' ? ', dormida' : mood === 'party' ? ', festejando' : ', contenta');
  }
  function streakHtml(k, s, adult) {
    var tu = adult ? 'Su' : 'Tu';
    var week = '<div class="week" data-od-id="kid-week" aria-label="Últimos 7 días">' + s.week.map(function (d) {
      var c = d.status === 'done' ? 'on' : d.status === 'forgiven' || d.status === 'saved' ? 'saved' : '';
      return '<i class="' + c + '" data-s="' + d.status + '" title="' + WEEKDAY[C.weekday(d.day)] + '"></i>';
    }).join('') + '</div>';
    var full = s.week.filter(function (d) { return ['done', 'forgiven', 'saved'].indexOf(d.status) >= 0; }).length;
    var slots = ''; for (var i = 0; i < 2; i++) slots += i < s.wildcards ? '<img class="px" src="../img/pixel/cojin-heno.png" width="32" height="16" alt="">' : '<span class="wild-slot"></span>';
    var tokens = '<span class="wildcards" data-od-id="kid-tokens">' + slots + s.wildcards + ' de 2 comodines</span><span class="streak-best">Mejor racha: ' + s.best + (s.best === 1 ? ' día' : ' días') + '</span>';
    var restart = s.current === 0 && s.best > 0 ? '<span class="streak-best" data-od-id="kid-restart">¡Empecemos de nuevo! ' + tu + ' récord fue ' + s.best + ' días</span>' : '';   // rachas R10
    // rachas R12: the age decides what leads
    if (k.ageRange === '4-6') return '<span class="streak-cap">' + tu + ' semana</span><span class="streak-num" style="font-size:1.25rem">¡' + tu + ' gallina está contenta!</span>' + week;
    if (k.ageRange === '7-9') return '<span class="streak-cap">' + tu + ' semana</span><span class="streak-num" data-od-id="kid-week-count">' + full + '<span class="streak-unit">de 7 días</span></span>' + week + '<span class="streak-best">Racha de ' + s.current + ' días</span>' + restart;
    return '<span class="streak-cap">' + tu + ' racha</span><span class="streak-num" data-od-id="kid-streak-count">' + s.current + '<span class="streak-unit">' + (s.current === 1 ? 'día' : 'días') + '</span></span>' + week + tokens + restart;
  }
  // a kid's own screens: only that kid (an adult has Hoy); null when the screen was replaced by a state
  function kidOnly(doc, root) {
    if (isAdult()) { WB.ui.stateScreen(q(doc, root), { kind: 'no-access', title: 'Esto es de los hijos', text: 'Aquí cada hijo ve lo suyo.', primary: { label: 'Ir a Hoy', go: 'app.today' } }); WB.setScreenState('no-access'); return null; }
    return me();
  }
  // the kid's bar (Open Design decision 37, DECISIONS F11): four tabs and the nest, «¡Lo hice!» with what is left to mark
  function kidBar(doc, active, k, show) {
    var bar = q(doc, 'tabs'); if (!bar) return;
    bar.hidden = !show; if (!show) return;
    [].forEach.call(bar.querySelectorAll('[data-go]'), function (b) {
      if (b.getAttribute('data-go') === active) b.setAttribute('aria-current', 'page');
      b.onclick = function () { WB.go(b.getAttribute('data-go')); };
    });
    q(doc, 'tab-nest').onclick = function () { if (active === 'app.kid' && doc.defaultView.CSKidSheet) doc.defaultView.CSKidSheet(true); else WB.go('app.kid', { hice: 1 }); };
    render(doc, function () {
      var w = W(), t = today(), left = C.dueChores(w, k.id, t).filter(function (c) { return !C.markOf(w, k.id, c.id, t); }).length, nest = q(doc, 'tab-nest');
      nest.classList.toggle('is-done', !left);
      q(doc, 'tab-nest-label').textContent = left ? '¡Lo hice!' : 'Todo listo';
      q(doc, 'tab-nest-badge').textContent = left || '';
      nest.setAttribute('aria-label', left ? '¡Lo hice! ' + left + (left === 1 ? ' tarea' : ' tareas') + ' por marcar' : 'Todo listo, no quedan tareas');
    });
  }
  function choreCard(w, k, c, t, adult, where) {
    var m = C.markOf(w, k.id, c.id, t), redone = w.marks.some(function (x) { return x.kid === k.id && x.chore === c.id && x.day === t && x.status === 'redo'; });
    var end = '', chips = '';
    if (!m) end = '<button type="button" class="btn btn--sm' + (redone ? ' btn--tonal' : '') + '" data-od-id="' + where + '-mark-' + c.id + '" data-mark="' + c.id + '">' + (adult ? 'Marcar hecha' : redone ? '¡Ya quedó!' : '¡Lo hice!') + '</button>';
    if (!m && redone) chips = '<span class="chip chip--redo">↻ Repítela</span>';
    if (m && m.status === 'pending') { chips = '<span class="chip chip--wait">En espera</span>'; end = ''; }
    if (m && m.status === 'approved') { end = '<span class="chip chip--ok">✓ Aprobada</span>'; chips = m.praise ? '<span class="praise">«' + esc(m.praise) + '» · ' + esc(who(m.approvedBy)) + '</span>' : ''; }
    return '<article class="task" data-od-id="' + where + '-chore-' + c.id + '"><span class="task-icon" aria-hidden="true">' + (c.icon || '✨') + '</span>'
      + '<div class="task-body"><span class="task-title">' + esc(c.name) + '</span><div class="task-meta"><span class="eggs"><img class="px" src="../img/pixel/huevo.png" width="12" height="15" alt="">+' + c.eggs + '</span>' + chips + '</div></div>'
      + '<div class="task-end">' + end + '</div></article>';
  }
  var MONTH = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  WB.wire('app.kid', function (WB, doc) {
    preview('app.kid');
    var k = kidOf(), adult = isAdult();
    if (!k) {
      var first = kids()[0];
      if (adult && first && !WB.params.kid) { WB.setScreenContext({ kid: first.id }); k = first; }
      else { WB.ui.stateScreen(q(doc, 'kid'), { kind: 'not-found', title: 'No encontramos a este hijo', text: 'Regresa a Hoy y elige a uno.', primary: { label: 'Ir a Hoy', go: 'app.today' } }); WB.setScreenState('not-found'); return; }
    }
    if (!adult && k.id !== me().id) { WB.ui.stateScreen(q(doc, 'kid'), { kind: 'no-access', title: 'Este no es tu día', text: 'Cada quien ve solo lo suyo.', primary: { label: 'Ir a mi día', go: 'app.kid' } }); WB.setScreenState('no-access'); return; }
    kidBar(doc, 'app.kid', k, !adult);
    q(doc, 'kid-back').hidden = !adult; q(doc, 'kid-back').onclick = function () { WB.back('app.today'); };
    q(doc, 'kid-prizes').hidden = !adult; q(doc, 'kid-prizes').onclick = function () { WB.go('app.prizes', { kid: k.id }); };
    q(doc, 'kid-streak-card').hidden = !adult;   // the kid has «Racha» in the bar
    // the nest's sheet: what is left to mark
    var sheet = q(doc, 'kid-sheet'), scrim = q(doc, 'kid-scrim'), still = WB.still || doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function openSheet(on) {
      sheet.hidden = scrim.hidden = !on;
      sheet.classList.toggle('is-entering', on && !still);
      if (on) (sheet.querySelector('[data-mark]') || q(doc, 'kid-sheet-close')).focus(); else q(doc, 'tab-nest').focus();
    }
    doc.defaultView.CSKidSheet = openSheet;
    q(doc, 'kid-sheet-close').onclick = scrim.onclick = function () { openSheet(false); };
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !sheet.hidden) openSheet(false); });
    render(doc, function () {
      var w = W(), t = today(), due = C.dueChores(w, k.id, t), s = C.streak(w, k.id, t), e = C.eggs(w, k.id, t);
      var marked = due.filter(function (c) { return C.markOf(w, k.id, c.id, t); }), allDone = due.length && marked.length === due.length;
      var d = new Date(t + 'T12:00:00');
      q(doc, 'kid-sub').textContent = (WEEKDAY[C.weekday(t)] + ' ' + d.getDate() + ' de ' + MONTH[d.getMonth()]).replace(/^./, function (c) { return c.toUpperCase(); });
      q(doc, 'kid-hello').textContent = adult ? k.name : 'Hola, ' + (k.short || k.name);
      q(doc, 'kid-eggs').querySelector('b').textContent = e.balance;
      q(doc, 'kid-eggs').setAttribute('aria-label', e.balance + ' huevos');
      drawHen(q(doc, 'kid-hen'), w, k, adult, allDone);
      // one egg per chore of the day, laid when it is marked
      q(doc, 'kid-laid').innerHTML = due.map(function (c, i) { return '<img class="px' + (i < marked.length ? '' : ' ghost') + '" src="../img/pixel/huevo.png" width="24" height="30" alt="">'; }).join('');
      q(doc, 'kid-day').textContent = !due.length ? 'Hoy descansas' : allDone ? (adult ? '¡Hizo' : '¡Hiciste') + ' todas ' + (adult ? 'sus' : 'tus') + ' tareas de hoy!' : marked.length + ' de ' + due.length + (due.length === 1 ? ' tarea hoy' : ' tareas hoy');
      if (adult) q(doc, 'kid-streak').innerHTML = streakHtml(k, s, adult);
      // rachas R7: an adult forgives a missed day of the last 48 hours (repair, R8, is not built yet: flows/daily-loop.md)
      var miss = adult ? [C.addDays(t, -1), C.addDays(t, -2)].filter(function (dd) { return C.canForgive(w, k.id, dd, t); })[0] : null, fg = q(doc, 'kid-forgive');
      fg.hidden = !miss;
      if (miss) {
        fg.innerHTML = '<b>' + esc(k.name) + ' no completó el ' + WEEKDAY[C.weekday(miss)] + '</b><p>Puedes perdonar el día; su racha sigue como si lo hubiera cumplido.</p>'
          + '<button type="button" class="btn btn--block" data-od-id="kid-forgive-yes">Perdonar el día</button>';
        q(doc, 'kid-forgive-yes').onclick = function () {
          WB.state.update(function (w2) { w2.forgives.push({ id: newId('fg'), kid: k.id, day: miss, by: me().id, at: WB.clock.iso() }); }, 'perdonó el ' + WEEKDAY[C.weekday(miss)] + ' de ' + k.name);
          toast(doc, 'kid-toast', 'Día perdonado. La racha sigue.');
        };
      }
      q(doc, 'kid-for-adult').hidden = !(adult && !k.paired);
      // the list: what is left first, then what waits, then what is approved (Open Design's order)
      var rank = function (c) { var m = C.markOf(w, k.id, c.id, t); return !m ? 0 : m.status === 'pending' ? 1 : 2; };
      q(doc, 'kid-chores').innerHTML = due.slice().sort(function (a, b) { return rank(a) - rank(b); }).map(function (c) { return choreCard(w, k, c, t, adult, 'kid'); }).join('');
      if (!due.length) WB.ui.stateScreen(q(doc, 'kid-chores'), { kind: 'empty', compact: true, title: 'Hoy no hay tareas', text: 'Un día libre no cuenta ni rompe tu racha.' });
      var left = due.filter(function (c) { return !C.markOf(w, k.id, c.id, t); });
      q(doc, 'kid-sheet-list').innerHTML = left.length ? left.map(function (c) { return choreCard(w, k, c, t, adult, 'sheet'); }).join('')
        : '<div class="empty-k"><img class="px" src="../img/pixel/nido-heno.png" width="90" height="33" alt=""><b>¡Todo listo por hoy!</b><span>No te quedan tareas por marcar.</span></div>';
      [].forEach.call(doc.querySelectorAll('[data-mark]'), function (b) {
        b.onclick = function () {
          var c = choreOf(b.getAttribute('data-mark')), inSheet = !!b.closest('[data-od-id="kid-sheet"]');
          mark(k.id, c.id);
          toast(doc, 'kid-toast', adult || c.autoApprove ? '¡Aprobada! +' + c.eggs + ' huevos' : '¡Bien! Ahora la ve un adulto.');
          var hen = q(doc, 'kid-hen'); if (!still) { hen.classList.remove('hop'); void hen.offsetWidth; hen.classList.add('hop'); }
          if (inSheet) (sheet.querySelector('[data-mark]') || q(doc, 'kid-sheet-close')).focus();
        };
      });
      var waiting = due.some(function (c) { var m = C.markOf(w, k.id, c.id, t); return m && m.status === 'pending'; });
      WB.setScreenState(!due.length ? 'rest' : miss ? 'missed' : allDone ? 'all-done' : waiting ? 'waiting' : 'default');
    });
    if (WB.params.hice && !adult) openSheet(true);
  });

  /* ==========================================================================
     app.hen — «Mi gallina»: her stage, what is next (gallina R2, R3); provisional (DECISIONS F11)
     ========================================================================== */
  WB.wire('app.hen', function (WB, doc) {
    preview('app.hen');
    var k = kidOnly(doc, 'hen'); if (!k) return;
    kidBar(doc, 'app.hen', k, true);
    render(doc, function () {
      var w = W(), st = C.stage(w, k.id), stages = C.settings(w).stages, i = ['pollito', 'pollita', 'gallina', 'dorada'].indexOf(st.stage);
      drawHen(q(doc, 'hen-hen'), w, k, false, false);
      q(doc, 'hen-name').textContent = HEN[st.stage].name.replace(/^./, function (c) { return c.toUpperCase(); });
      q(doc, 'hen-step').textContent = 'Etapa ' + (i + 1) + ' de 4';
      q(doc, 'hen-fill').style.setProperty('--p', st.next ? Math.round(st.approved / st.next * 100) + '%' : '100%');   // the bar reads like its words
      q(doc, 'hen-next').textContent = st.next ? st.approved + ' de ' + st.next + ' tareas aprobadas para ser ' + HEN[['pollito', 'pollita', 'gallina', 'dorada'][i + 1]].name : '¡Ya es gallina dorada!';
      q(doc, 'hen-stages').innerHTML = ['pollito', 'pollita', 'gallina', 'dorada'].map(function (name, j) {
        var cls = j < i ? '' : j === i ? ' is-now' : ' is-next', sub = j < i ? 'Listo' : j === i ? 'Ahora' : stages[j - 1] + ' tareas';
        return '<div class="stage-k' + cls + '" data-od-id="hen-stage-' + name + '"><img class="px" src="' + henArt(doc, name, 'happy') + '" width="48" height="48" alt=""><span>' + (name === 'dorada' ? 'Dorada' : HEN[name].name.replace(/^./, function (c) { return c.toUpperCase(); })) + '</span><small>' + sub + '</small></div>';
      }).join('');
      WB.setScreenState('default');
    });
  });

  /* ==========================================================================
     app.streak — «Racha»: the streak, the wildcards, a pause (rachas R5, R10, R12); provisional (DECISIONS F11)
     ========================================================================== */
  WB.wire('app.streak', function (WB, doc) {
    preview('app.streak');
    var k = kidOnly(doc, 'streak'); if (!k) return;
    kidBar(doc, 'app.streak', k, true);
    render(doc, function () {
      var w = W(), t = today(), s = C.streak(w, k.id, t);
      drawHen(q(doc, 'streak-hen'), w, k, false, false);
      q(doc, 'kid-streak').innerHTML = streakHtml(k, s, false);
      WB.setScreenState('default');
    });
  });

  /* ==========================================================================
     app.prizes — the kid's prizes, and the adult's deliveries
     ========================================================================== */
  WB.wire('app.prizes', function (WB, doc) {
    preview('app.prizes');
    var k = kidOf(), adult = isAdult();
    if (!k && adult) { var first = kids()[0]; if (first) { WB.setScreenContext({ kid: first.id }); k = first; } }
    if (!k || (!adult && k.id !== me().id)) { WB.ui.stateScreen(q(doc, 'prizes'), { kind: 'no-access', title: 'Estos no son tus premios', text: 'Cada quien ve solo los suyos.', primary: { label: 'Ir a mis premios', go: 'app.prizes' } }); WB.setScreenState('no-access'); return; }
    kidBar(doc, 'app.prizes', k, !adult);
    q(doc, 'prizes-back').hidden = !adult; q(doc, 'prizes-back').onclick = function () { WB.back('app.today'); };
    render(doc, function () {
      var w = W(), t = today(), bal = C.eggs(w, k.id, t).balance;
      // huevos R6: «≈ N días de tareas», with this kid's current chores (a week's eggs over 7 days)
      var perDay = [0, 1, 2, 3, 4, 5, 6].reduce(function (n, i) { return n + C.dueChores(w, k.id, C.addDays(t, i)).reduce(function (a, c) { return a + c.eggs; }, 0); }, 0) / 7;
      q(doc, 'prizes-sub').textContent = adult ? 'De ' + k.name : 'Canjea tus huevos';
      q(doc, 'prizes-eggs').querySelector('b').textContent = bal;
      var open = w.redemptions.filter(function (r) { return r.kid === k.id && r.status === 'to-deliver'; });
      q(doc, 'prizes-pending-title').hidden = !open.length;
      q(doc, 'prizes-pending').innerHTML = open.map(function (r) {
        return '<div class="row" data-od-id="redemption-' + r.id + '"><span class="icon" aria-hidden="true">🎁</span><span><h4>' + esc(r.name) + '</h4><span class="meta"><span class="chip wait">Por entregar</span>' + ago(r.at) + '</span></span>'
          + (adult ? '<button type="button" class="btn" data-od-id="redemption-deliver-' + r.id + '" data-deliver="' + r.id + '">Entregado</button>' : '<span></span>') + '</div>';
      }).join('');
      q(doc, 'prizes-list').innerHTML = w.prizes.filter(function (p) { return p.kid === k.id; }).map(function (p) {
        var can = !adult && bal >= p.price, days = perDay ? Math.ceil(p.price / perDay) : null;
        return '<div class="row" data-od-id="prize-' + p.id + '"><span class="icon" aria-hidden="true">' + (p.icon || '🎁') + '</span>'
          + '<span><h4>' + esc(p.name) + '</h4><span class="meta"><span class="reward"><i class="egg sm"></i>' + p.price + '</span>' + (days ? '≈ ' + days + (days === 1 ? ' día' : ' días') + ' de tareas' : '') + '</span></span>'
          + (adult ? '<span></span>' : '<button type="button" class="btn' + (can ? '' : ' soft') + '" data-od-id="prize-redeem-' + p.id + '" data-redeem="' + p.id + '"' + (can ? '' : ' disabled') + '>' + (can ? 'Canjear' : 'Faltan ' + (p.price - bal)) + '</button>') + '</div>';
      }).join('');
      [].forEach.call(doc.querySelectorAll('[data-redeem]'), function (b) {
        b.onclick = function () {
          var p = byId('prizes', b.getAttribute('data-redeem'));
          if (C.eggs(W(), k.id, today()).balance < p.price) return;   // huevos R1: never negative
          WB.state.update(function (w2) { w2.redemptions.push({ id: newId('rd'), prize: p.id, kid: k.id, name: p.name, price: p.price, at: WB.clock.iso(), status: 'to-deliver' }); }, 'canjeó «' + p.name + '»');
          toast(doc, 'prizes-toast', '¡Canjeado! Tus papás ya lo saben.');
        };
      });
      [].forEach.call(doc.querySelectorAll('[data-deliver]'), function (b) {
        b.onclick = function () {
          var id = b.getAttribute('data-deliver');
          WB.state.update(function (w2) { var r = w2.redemptions.find(function (x) { return x.id === id; }); if (r && r.status === 'to-deliver') { r.status = 'delivered'; r.deliveredBy = me().id; r.deliveredAt = WB.clock.iso(); } }, 'entregó un premio');
          toast(doc, 'prizes-toast', 'Premio entregado.');
        };
      });
      WB.setScreenState(open.length ? 'to-deliver' : 'default');
    });
  });
})();
