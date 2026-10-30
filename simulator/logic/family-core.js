/* ==========================================================================
   ChickenStreaks simulator · logic/family-core.js — the rules as pure functions of the world (no WB, no DOM), so the
   screens and the node test (logic/family-core.test.cjs) use the same code.
     CSCore.dueChores(w, kid, day)        tareas R2: the chores a kid has that day
     CSCore.dayStatus(w, kid, day, today) rachas R1–R3, R6, R7: done · forgiven · paused · neutral · missed · open
     CSCore.streak(w, kid, today)         rachas R1–R11: { current, best, wildcards, week, milestones, brokeAt }
     CSCore.eggs(w, kid, today)           huevos R1, R4: the balance is the sum of its records, never negative
     CSCore.stage(w, kid)                 gallina R2, R3: pollito · pollita · gallina · dorada, from the total only
     CSCore.canForgive(w, kid, day, today) rachas R7: a missed day of the last 48 hours
   Days are local 'YYYY-MM-DD' strings (Mexico City). Settings come from world.settings (scenario `shell-base`), so a
   scenario can change them.
   ========================================================================== */
(function (root) {
  'use strict';
  var DEFAULTS = { wildcardMax: 2, wildcardEvery: 7, milestones: [7, 14, 30], milestoneEggs: 10, stages: [10, 50, 150] };
  function cfg(w) { return Object.assign({}, DEFAULTS, (w && w.settings) || {}); }
  function addDays(day, n) { var d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function weekday(day) { return new Date(day + 'T12:00:00Z').getUTCDay(); }
  function dayOf(iso) {   // the Mexico City day of a time (UTC−6 all year since 2022)
    return iso ? new Date(Date.parse(iso) - 6 * 3600e3).toISOString().slice(0, 10) : null;
  }

  function dueChores(w, kid, day) {
    return (w.chores || []).filter(function (c) {
      if (c.kids.indexOf(kid) < 0 || c.days.indexOf(weekday(day)) < 0) return false;
      if (c.createdAt && dayOf(c.createdAt) > day) return false;
      if (c.archivedAt && dayOf(c.archivedAt) <= day) return false;
      return true;
    });
  }
  // the kid's mark of a chore on a day that still counts (a «Repítela» does not: tareas R12)
  function markOf(w, kid, chore, day) {
    return (w.marks || []).filter(function (m) { return m.kid === kid && m.chore === chore && m.day === day && m.status !== 'redo'; })[0] || null;
  }
  function paused(w, kid, day) {
    return (w.pauses || []).some(function (p) { return p.kid === kid && dayOf(p.from) <= day && (!p.until || dayOf(p.until) >= day); });
  }
  function dayStatus(w, kid, day, today) {
    if (paused(w, kid, day)) return 'paused';                                       // rachas R6
    var due = dueChores(w, kid, day);
    if (!due.length) return 'neutral';                                              // rachas R3
    if (due.every(function (c) { return markOf(w, kid, c.id, day); })) return 'done';  // R1, R2: marked counts, approved or not
    if ((w.forgives || []).some(function (f) { return f.kid === kid && f.day === day; })) return 'forgiven';  // R7
    return day === today ? 'open' : 'missed';
  }

  function firstDay(w, kid) {
    var days = (w.chores || []).filter(function (c) { return c.kids.indexOf(kid) >= 0; }).map(function (c) { return dayOf(c.createdAt); }).filter(Boolean).sort();
    return days[0] || null;
  }
  // ponytail: walks every day since the kid's first chore — O(days × chores); fine for a simulated family of weeks
  function streak(w, kid, today) {
    var s = cfg(w), out = { current: 0, best: 0, wildcards: 0, week: [], milestones: [], brokeAt: null, savedAt: [] };
    var d = firstDay(w, kid);
    if (!d) return out;
    var log = [];
    for (; d <= today; d = addDays(d, 1)) {
      var st = dayStatus(w, kid, d, today);
      if (st === 'done' || st === 'forgiven') {
        out.current++;
        if (out.current % s.wildcardEvery === 0) out.wildcards = Math.min(s.wildcardMax, out.wildcards + 1);   // R5
        if (s.milestones.indexOf(out.current) >= 0) out.milestones.push({ day: d, days: out.current });       // R11
        out.best = Math.max(out.best, out.current);
      } else if (st === 'missed') {
        if (out.wildcards > 0) { out.wildcards--; st = 'saved'; out.savedAt.push(d); }                        // R5
        else if (out.current > 0) { out.current = 0; out.brokeAt = d; }                                       // R10
      }
      log.push({ day: d, status: st });
    }
    // the last 7 days, for the week bar (oldest first)
    for (var i = 6; i >= 0; i--) { var day = addDays(today, -i), hit = log.filter(function (x) { return x.day === day; })[0]; out.week.push({ day: day, status: hit ? hit.status : 'neutral' }); }
    return out;
  }

  function eggs(w, kid, today) {
    var s = cfg(w), earned = 0, spent = 0;
    (w.marks || []).forEach(function (m) { if (m.kid === kid && m.status === 'approved') earned += m.eggs || 0; });   // R1: on approval
    var bonus = streak(w, kid, today).milestones.length * s.milestoneEggs;                                           // R1, rachas R11
    (w.redemptions || []).forEach(function (r) { if (r.kid === kid) spent += r.price; });                             // R8: set aside at once
    return { earned: earned, bonus: bonus, spent: spent, balance: Math.max(0, earned + bonus - spent) };
  }

  var STAGES = ['pollito', 'pollita', 'gallina', 'dorada'];
  function stage(w, kid) {
    var s = cfg(w), n = (w.marks || []).filter(function (m) { return m.kid === kid && m.status === 'approved'; }).length, i = 0;
    while (i < s.stages.length && n >= s.stages[i]) i++;
    return { stage: STAGES[i], approved: n, next: s.stages[i] || null };
  }

  function canForgive(w, kid, day, today) {
    return day < today && day >= addDays(today, -2) && dayStatus(w, kid, day, today) === 'missed';
  }

  var CSCore = { dueChores: dueChores, markOf: markOf, dayStatus: dayStatus, streak: streak, eggs: eggs, stage: stage, canForgive: canForgive, addDays: addDays, weekday: weekday, dayOf: dayOf, settings: cfg };
  if (typeof module !== 'undefined' && module.exports) module.exports = CSCore; else root.CSCore = CSCore;
})(this);
