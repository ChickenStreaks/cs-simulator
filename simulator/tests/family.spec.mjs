// The daily loop through the shell (flows/daily-loop.md, flows/prizes.md): «See as» changes the app's mode, a mark
// waits for approval and its eggs arrive on approval, the clock approves by itself, a missed day is forgiven, a new chore
// returns to where it started, and «Reset» brings everything back.
import { test, expect } from '@playwright/test';
import { openShell, noErrors, screen, waitHere, open, backsTo, landed } from './helpers.mjs';

const eggsOf = (page, kid) => page.evaluate((k) => CSCore.eggs(WB.state.get(), k, WB.clock.day()).balance, kid);

test('«See as» Kids opens the kid\'s app; a parent screen says it is for parents', async ({ page }) => {
  await openShell(page, { hash: '#app.today' });
  await waitHere(page, 'app.today', 'default');
  await page.locator('[data-testid="sh-viewas-kids"]').click();
  await waitHere(page, 'app.kid', 'waiting');
  await expect(screen(page).locator('[data-od-id="kid-hello"]')).toHaveText('Hola, Sofi');
  await open(page, 'app.approvals');
  await waitHere(page, 'app.approvals', 'no-access');
  await expect(screen(page).locator('[data-od-id="state-title"]')).toContainText('Esto es para papás');
  noErrors(page);
});

test('a kid marks a chore: it waits; an adult approves it with a praise and the eggs arrive (tareas R8, R11, huevos R1)', async ({ page }) => {
  await openShell(page);
  await page.evaluate(() => { WB.reset('shell-base'); WB.viewAs.set('p-sofia'); });
  await open(page, 'app.kid');
  await waitHere(page, 'app.kid', 'waiting');
  const before = await eggsOf(page, 'p-sofia');
  await screen(page).locator('[data-od-id="kid-mark-ch-sofia-juguetes"]').click();
  await expect(screen(page).locator('[data-od-id="kid-chore-ch-sofia-juguetes"]')).toContainText('En espera');
  await page.waitForTimeout(300);
  expect(await eggsOf(page, 'p-sofia'), 'no eggs before approval').toBe(before);
  const id = await page.evaluate(() => WB.state.list('marks', (m) => m.chore === 'ch-sofia-juguetes' && m.status === 'pending')[0].id);
  await page.evaluate(() => WB.viewAs.set('p-mama'));
  await open(page, 'app.approvals');
  await waitHere(page, 'app.approvals', 'default');
  await screen(page).locator(`[data-od-id="approval-praise-${id}-1"]`).click();
  await screen(page).locator(`[data-od-id="approval-ok-${id}"]`).click();
  await expect(screen(page).locator(`[data-od-id="approved-${id}"]`)).toContainText('Aprobada por Mamá');
  await expect(screen(page).locator(`[data-od-id="approved-${id}"]`)).toContainText('Se esforzó');
  await expect.poll(() => eggsOf(page, 'p-sofia')).toBe(before + 10);
  noErrors(page);
});

test('«Repetir» sends it back without punishment: the kid sees «Repítela» (tareas R12)', async ({ page }) => {
  await openShell(page);
  await page.evaluate(() => { WB.reset('shell-base'); WB.viewAs.set('p-papa'); });
  await open(page, 'app.approvals');
  await waitHere(page, 'app.approvals', 'default');
  await screen(page).locator('[data-od-id="approval-redo-mk-sofia-cama-hoy"]').click();
  await page.evaluate(() => WB.viewAs.set('p-sofia'));
  await open(page, 'app.kid');
  await waitHere(page, 'app.kid');
  await expect(screen(page).locator('[data-od-id="kid-chore-ch-sofia-cama"]')).toContainText('Repítela');
  await expect(screen(page).locator('[data-od-id="kid-mark-ch-sofia-cama"]')).toHaveText('¡Ya quedó!');
});

test('the clock approves a mark nobody approved in 24 hours (tareas R10)', async ({ page }) => {
  await openShell(page);
  // from the console: a mark pending 23 hours, then the clock moves 1 hour
  await page.evaluate(() => {
    WB.reset('shell-base'); WB.viewAs.set('p-mama');
    WB.state.patch([{ op: 'add', col: 'marks', item: { id: 'mk-mateo-tarea-old', chore: 'ch-mateo-tarea', kid: 'p-mateo', day: '-1d', at: '-23h', by: 'p-mateo', status: 'pending' } }]);
    WB.clock.advance('1h');
  });
  await open(page, 'app.approvals');
  await waitHere(page, 'app.approvals');
  await expect(screen(page).locator('[data-od-id="approved-mk-mateo-tarea-old"]')).toContainText('Se aprobó sola');
  noErrors(page);
});

test('a missed day: the adult forgives it within 48 hours and the streak comes back (rachas R7, R10)', async ({ page }) => {
  await openShell(page);
  await page.evaluate(() => { WB.reset('family-missed'); WB.viewAs.set('p-sofia'); });
  await open(page, 'app.streak');
  await waitHere(page, 'app.streak');
  await expect(screen(page).locator('[data-od-id="kid-restart"]')).toContainText('¡Empecemos de nuevo!');
  await page.evaluate(() => WB.viewAs.set('p-mama'));
  await open(page, 'app.kid', { kid: 'p-sofia' });
  await waitHere(page, 'app.kid', 'missed');
  await screen(page).locator('[data-od-id="kid-forgive-yes"]').click();
  await expect(screen(page).locator('[data-od-id="kid-forgive"]')).toBeHidden();
  await expect.poll(() => page.evaluate(() => CSCore.streak(WB.state.get(), 'p-sofia', WB.clock.day()).current)).toBe(5);
  noErrors(page);
});

test('a new chore returns to where it started, and the kid has it today (WB.flow, tareas R2)', async ({ page }) => {
  await openShell(page);
  await page.evaluate(() => { WB.reset('shell-base'); WB.viewAs.set('p-papa'); });
  await open(page, 'app.chores');
  await landed(page, 'app.chores');
  await screen(page).locator('[data-od-id="chores-new"]').click();
  await waitHere(page, 'app.chore-new');
  const save = screen(page).locator('[data-od-id="chore-new-save"]');
  await expect(save).toBeDisabled();
  await screen(page).locator('[data-od-id="chore-new-kid-p-mateo"]').click();
  await screen(page).locator('[data-od-id="chore-new-name"]').fill('Ayudar con la estufa');
  await expect(screen(page).locator('[data-od-id="chore-new-safety"]')).toBeVisible();   // tareas R4: a note, never a block
  await expect(save).toBeEnabled();
  await save.click();
  await landed(page, 'app.chores');
  await expect(screen(page).locator('[data-od-id="chores-list"]')).toContainText('Ayudar con la estufa');
  expect(await backsTo(page, 'app.chore-new', 2), 'the finished operation left the history').toBe(-1);
  await expect.poll(() => page.evaluate(() => CSCore.dueChores(WB.state.get(), 'p-mateo', WB.clock.day()).map((c) => c.name))).toContain('Ayudar con la estufa');
});

test('a kid redeems a prize; it waits «Por entregar» until an adult delivers it (huevos R8)', async ({ page }) => {
  await openShell(page);
  await page.evaluate(() => { WB.reset('shell-base'); WB.viewAs.set('p-sofia'); });
  await open(page, 'app.prizes');
  await waitHere(page, 'app.prizes', 'default');
  await expect(screen(page).locator('[data-od-id="prize-redeem-pz-sofia-helado"]')).toBeDisabled();
  await screen(page).locator('[data-od-id="prize-redeem-pz-sofia-peli"]').click();
  await waitHere(page, 'app.prizes', 'to-deliver');
  await expect.poll(() => eggsOf(page, 'p-sofia')).toBe(15);
  await page.evaluate(() => WB.viewAs.set('p-papa'));
  await open(page, 'app.prizes', { kid: 'p-sofia' });
  await waitHere(page, 'app.prizes', 'to-deliver');
  await screen(page).locator('[data-od-id^="redemption-deliver-"]').click();
  await waitHere(page, 'app.prizes', 'default');
});

test('«Reset» in the bar brings the family back: person, clock, records, signed out at the splash', async ({ page }) => {
  await openShell(page);
  await page.evaluate(() => { WB.reset('shell-base'); WB.viewAs.set('p-papa'); WB.clock.advance('1d'); WB.state.update((w) => { w.chores = []; }); });
  await page.locator('[data-testid="sh-reset"]').click();
  await expect.poll(() => page.evaluate(() => [WB.viewAs.get().person, WB.state.list('chores').length, Math.abs(WB.clock.now() - Date.now()) < 120e3, WB.session.get().signedIn, WBShell.here().screen])).toEqual(['p-mama', 6, true, false, 'app.splash']);
});

test('«Theme» in the bar turns the shell and the screen dark and back', async ({ page }) => {
  await openShell(page, { hash: '#app.today' });
  await waitHere(page, 'app.today');
  await page.locator('[data-testid="sh-theme-dark"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(screen(page).locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('[data-testid="sh-theme-light"]').click();
  await expect(screen(page).locator('html')).toHaveAttribute('data-theme', 'light');
  noErrors(page);
});

test('the kid\'s bar: the nest opens what is left, a mark from there waits, and the tabs go to Mi gallina and Racha (DECISIONS F11)', async ({ page }) => {
  await openShell(page);
  await page.evaluate(() => { WB.reset('shell-base'); WB.viewAs.set('p-sofia'); });
  await open(page, 'app.kid');
  await waitHere(page, 'app.kid', 'waiting');
  const s = screen(page);
  await expect(s.locator('[data-od-id="tabs"]')).toBeVisible();
  await expect(s.locator('[data-od-id="tab-nest-badge"]')).toHaveText('1');
  await s.locator('[data-od-id="tab-nest"]').click();
  await expect(s.locator('[data-od-id="kid-sheet"]')).toBeVisible();
  await s.locator('[data-od-id="sheet-mark-ch-sofia-juguetes"]').click();
  await expect(s.locator('[data-od-id="kid-chore-ch-sofia-juguetes"]')).toContainText('En espera');
  await expect(s.locator('[data-od-id="tab-nest-label"]')).toHaveText('Todo listo');
  await expect(s.locator('[data-od-id="kid-sheet-list"]')).toContainText('¡Todo listo por hoy!');
  await s.locator('[data-od-id="kid-sheet-close"]').click();
  await s.locator('[data-od-id="tab-hen"]').click();
  await waitHere(page, 'app.hen', 'default');
  await expect(screen(page).locator('[data-od-id="hen-step"]')).toHaveText(/Etapa \d de 4/);
  await screen(page).locator('[data-od-id="tab-streak"]').click();
  await waitHere(page, 'app.streak', 'default');
  await expect(screen(page).locator('[data-od-id="kid-streak"]')).toBeVisible();
  await page.evaluate(() => WB.viewAs.set('p-mama'));
  await open(page, 'app.hen');
  await waitHere(page, 'app.hen', 'no-access');
  noErrors(page);
});
