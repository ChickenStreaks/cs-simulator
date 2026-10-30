// A «still» (?still=1&as=<person>, sim.js): a screen shown only to be looked at, as the gallery does. It sees the
// standard family as that person, never navigates by itself and never saves anything (specs/2026-10-30-two-doors-design.md).
import { test, expect } from '@playwright/test';

test('a still never navigates and never saves', async ({ page }) => {
  await page.goto('/simulator/screens/app/splash?still=1&as=p-mama');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(7000);   // the splash's animation is ≈ 5.4 s; a live splash would be on the slides by now
  expect(page.url()).toContain('splash');
  expect(await page.evaluate(() => WB.still)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('cs-sim/v1'))).toBeNull();
});

test('a still sees as its person, whatever See as says', async ({ page }) => {
  await page.goto('/simulator/screens/app/today');
  await page.evaluate(() => WB.viewAs.set('p-mama'));
  await page.goto('/simulator/screens/app/kid?kid=p-sofia&still=1&as=p-sofia');
  await page.waitForFunction(() => window.WB && WB.state);
  expect(await page.evaluate(() => WB.viewAs.get().person)).toBe('p-sofia');
  await expect(page.locator('[data-od-id="kid-hello"]')).toHaveText('Hola, Sofi');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cs-sim/v1')).ctx.viewAs.person)).toBe('p-mama');
});
