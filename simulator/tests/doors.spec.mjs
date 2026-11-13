// The first page's two doors (specs/2026-10-30-two-doors-design.md): «Use the app» — Start the first time, then
// Continue or Start from the splash — and «See the screens». Reset in the app is a new install; an old link to the
// simulator (/simulator/#screen) opens the app.
import { test, expect } from '@playwright/test';
import { screen, waitHere, open } from './helpers.mjs';

const ready = (page) => page.waitForFunction(() => window.WBShell && window.WB && window.WB.index);

test('a first visit offers only Start, and Start plays the splash', async ({ page }) => {
  await page.goto('/simulator/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('[data-testid="door-continue"]')).toBeHidden();
  await expect(page.locator('[data-testid="door-start"]')).toHaveText('Start');
  await page.locator('[data-testid="door-start"]').click();
  await ready(page);
  expect(page.url()).toContain('app');
  await waitHere(page, 'app.splash');
});

test('after the slides the doors offer Continue and Start from the splash', async ({ page }) => {
  await page.goto('/simulator/app.html');
  await ready(page);
  await open(page, 'app.onboarding', {}, 'slide-4');
  await waitHere(page, 'app.onboarding', 'slide-4');
  await screen(page).locator('[data-od-id="onboarding-cta"]').click();
  await waitHere(page, 'app.access');
  await page.goto('/simulator/');
  await expect(page.locator('[data-testid="door-continue"]')).toBeVisible();
  await expect(page.locator('[data-testid="door-start"]')).toHaveText('Start from the splash');
  await page.locator('[data-testid="door-continue"]').click();
  await ready(page);
  await waitHere(page, 'app.access');
});

test('leaving the app mid-way, even signed out on a slide, the doors offer Continue back to that screen', async ({ page }) => {
  await page.goto('/simulator/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/simulator/app.html?from=splash');
  await ready(page);
  await open(page, 'app.onboarding', {}, 'slide-3');
  await waitHere(page, 'app.onboarding', 'slide-3');
  await page.goto('/simulator/');
  await expect(page.locator('[data-testid="door-continue"]')).toBeVisible();
  await page.locator('[data-testid="door-continue"]').click();
  await ready(page);
  await waitHere(page, 'app.onboarding');   // the screen; the slide itself is not remembered (the shell keeps no ?estado)
});

test('Start from the splash signs out and plays the splash, keeping the family', async ({ page }) => {
  await page.goto('/simulator/app.html');
  await ready(page);
  await page.evaluate(() => { WB.session.signIn('p-mama'); WB.state.update((w) => { w.chores = w.chores.slice(0, 2); }); });
  await page.goto('/simulator/');
  await page.locator('[data-testid="door-start"]').click();
  await ready(page);
  await waitHere(page, 'app.splash');
  await expect.poll(() => page.evaluate(() => [WB.session.get().signedIn, WB.state.list('chores').length])).toEqual([false, 2]);
});

test('Reset is a new install: signed out, as Parent, at the splash, and no Continue', async ({ page }) => {
  await page.goto('/simulator/app.html');
  await ready(page);
  await page.evaluate(() => { WB.session.signIn('p-mama'); WB.viewAs.set('p-sofia'); });
  await page.locator('[data-testid="sh-reset"]').click();
  await waitHere(page, 'app.splash');
  expect(await page.evaluate(() => [WB.session.get().signedIn, WB.viewAs.get().person, WB.state.list('chores').length])).toEqual([false, 'p-mama', 6]);
  await page.goto('/simulator/');
  await expect(page.locator('[data-testid="door-continue"]')).toBeHidden();
});

test('an old link to the simulator opens the app on that screen', async ({ page }) => {
  await page.goto('/simulator/#app.kid?kid=p-emi');
  await ready(page);
  await waitHere(page, 'app.kid');
  expect(await page.evaluate(() => WBShell.current().params.kid)).toBe('p-emi');
});

test('See the screens opens the gallery', async ({ page }) => {
  await page.goto('/simulator/');
  await page.locator('[data-testid="door-screens"]').click();
  await expect(page).toHaveURL(/gallery/);
});

test("the app's bar opens the gallery", async ({ page }) => {
  await page.goto('/simulator/app.html');
  await ready(page);
  await page.locator('[data-testid="sh-screens"]').click();
  await expect(page).toHaveURL(/gallery/);
  await expect(page.locator('[data-testid="gal-item"]').first()).toBeVisible();
});
