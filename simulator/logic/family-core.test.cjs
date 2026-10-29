// The rules of logic/family-core.js, without a browser: node --test logic/family-core.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('./family-core.js');

const T = '2026-10-28';   // a Wednesday
const day = (n) => C.addDays(T, n);
const kid = 'p-sofia';
// one chore every day, created 20 days ago; marks on the given day offsets
function world(marked, extra = {}) {
  return Object.assign({
    settings: {},
    chores: [{ id: 'ch-cama', kids: [kid], days: [0, 1, 2, 3, 4, 5, 6], eggs: 10, createdAt: day(-20) + 'T15:00:00Z' }],
    marks: marked.map((n, i) => ({ id: 'mk-' + i, chore: 'ch-cama', kid, day: day(n), status: 'approved', eggs: 10 })),
    forgives: [], pauses: [], redemptions: []
  }, extra);
}
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

test('a day counts when every due chore is marked, approved or not (rachas R1, R2)', () => {
  const w = world([-1]);
  w.marks[0].status = 'pending';
  assert.equal(C.dayStatus(w, kid, day(-1), T), 'done');
  w.marks[0].status = 'redo';
  assert.equal(C.dayStatus(w, kid, day(-1), T), 'missed');
});

test('today unfinished is open, never missed (rachas R13: no threat)', () => {
  assert.equal(C.dayStatus(world([]), kid, T, T), 'open');
});

test('a day with no chores is neutral (rachas R3)', () => {
  const w = world([]);
  w.chores[0].days = [1];   // Mondays only
  assert.equal(C.dayStatus(w, kid, T, T), 'neutral');
});

test('streak grows, earns a wildcard every 7 days and a wildcard saves a missed day (rachas R5)', () => {
  const s = C.streak(world(range(-20, -1).filter((n) => n !== -3)), kid, T);
  assert.equal(s.savedAt.length, 1);
  assert.equal(s.current, 19);
  assert.equal(s.wildcards, 1);   // 2 earned at 7 and 14, one spent
});

test('without wildcards a missed day starts over, and the best stays (rachas R10)', () => {
  const s = C.streak(world([-5, -4, -2, -1]), kid, T);
  assert.equal(s.current, 2);
  assert.equal(s.best, 2);
  assert.equal(s.brokeAt, day(-3));
});

test('a forgiven day counts as done; only within 48 hours (rachas R7)', () => {
  const w = world([-3, -1]);
  assert.equal(C.canForgive(w, kid, day(-2), T), true);
  assert.equal(C.canForgive(w, kid, day(-4), T), false);
  w.forgives.push({ id: 'fg-1', kid, day: day(-2) });
  assert.equal(C.streak(w, kid, T).current, 3);
});

test('a paused day neither grows nor breaks (rachas R6)', () => {
  const w = world([-3, -1], { pauses: [{ id: 'pa-1', kid, from: day(-2) + 'T15:00:00Z', until: day(-2) + 'T15:00:00Z' }] });
  assert.equal(C.streak(w, kid, T).current, 2);
});

test('eggs: approved marks plus milestone bonus minus prizes; never negative (huevos R1, R4, rachas R11)', () => {
  const w = world(range(-7, -1));
  assert.deepEqual(C.eggs(w, kid, T), { earned: 70, bonus: 10, spent: 0, balance: 80 });
  w.redemptions.push({ id: 'rd-1', kid, price: 200 });
  assert.equal(C.eggs(w, kid, T).balance, 0);
});

test('the hen grows with the total and never goes back (gallina R2, R3)', () => {
  assert.equal(C.stage(world(range(-9, -1)), kid).stage, 'pollito');
  assert.equal(C.stage(world(range(-10, -1)), kid).stage, 'pollita');
  assert.equal(C.stage(world([-20, -18, -16, -14, -12, -10, -8, -6, -4, -2]), kid).stage, 'pollita');   // a broken streak keeps her
});
