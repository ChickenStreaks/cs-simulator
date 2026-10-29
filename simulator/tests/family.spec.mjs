// The daily loop through the shell (flows/daily-loop.md, flows/prizes.md): «Ver como» changes the app's mode, a mark
// waits for approval and its eggs arrive on approval, the clock approves by itself, a missed day is forgiven, a new chore
// returns to where it started, «Empezar de nuevo» brings everything back, and a comment carries its context.
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { openShell, noErrors, screen, waitHere, open, rows, shotFile, mark, backsTo, landed, barItem } from './helpers.mjs';

const eggsOf = (page, kid) => page.evaluate((k) => CSCore.eggs(WB.state.get(), k, WB.clock.day()).balance, kid);

test('«Ver como» a kid opens the kid\'s app; a parent screen says it is for parents', async ({ page }) => {
  await openShell(page, { hash: '#app.today' });
  await waitHere(page, 'app.today', 'default');
  await barItem(page, 'viewas');
  await page.locator('[data-testid="sh-person-p-sofia"]').click();
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
  await page.evaluate(() => WB.reset('shell-base'));
  await page.evaluate(() => WBShell._.applySituation('family-auto-approve'));
  await waitHere(page, 'app.approvals');
  await expect(screen(page).locator('[data-od-id="approved-mk-mateo-tarea-old"]')).toContainText('Se aprobó sola');
  noErrors(page);
});

test('a missed day: the adult forgives it within 48 hours and the streak comes back (rachas R7, R10)', async ({ page }) => {
  await openShell(page);
  await page.evaluate(() => { WB.reset('family-missed'); WB.viewAs.set('p-sofia'); });
  await open(page, 'app.kid');
  await waitHere(page, 'app.kid');
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

test('«Empezar de nuevo» brings the family back: person, clock, records', async ({ page }) => {
  await openShell(page);
  await page.evaluate(() => { WB.reset('shell-base'); WB.viewAs.set('p-papa'); WB.clock.advance('1d'); WB.state.update((w) => { w.chores = []; }); });
  await barItem(page, 'reset');
  await page.locator('[data-testid="sh-reset-yes"]').click();
  await expect.poll(() => page.evaluate(() => [WB.viewAs.get().person, WB.state.list('chores').length, Math.abs(WB.clock.now() - Date.now()) < 120e3])).toEqual(['p-mama', 6, true]);
});

test('a comment carries the screen, the element, «Ver como», the kid and a screenshot', async ({ page }) => {
  await openShell(page);
  await page.evaluate(() => { WB.reset('shell-base'); WB.viewAs.set('p-mama'); });
  await open(page, 'app.kid', { kid: 'p-emi' });
  await waitHere(page, 'app.kid');
  await page.locator('[data-testid="sh-comment"]').click();
  await expect(page.locator('[data-testid="sh-pick"]')).toBeVisible();
  const box = await screen(page).locator('[data-od-id="kid-hero"]').boundingBox();
  await page.mouse.click(box.x + 20, box.y + box.height / 2);
  const text = mark('La gallina se ve pequeña.');
  await page.locator('[data-testid="sh-comment-text"]').fill(text);
  await page.locator('[data-testid="sh-comment-send"]').click();
  await expect(page.locator('[data-testid="sh-toast"]')).toContainText('Enviado', { timeout: 20000 });
  const r = rows().find((x) => x.text === text);
  expect(r, 'the row is in comments.jsonl').toBeTruthy();
  expect(r).toMatchObject({ screen: 'app.kid', screen_unknown: 0, scenario: 'shell-base', view_as_person: 'p-mama', view_as_role: 'adult', view_as_context: 'p-emi', has_shot: 1 });
  expect(fs.existsSync(shotFile(r.id))).toBe(true);
  noErrors(page);
});
