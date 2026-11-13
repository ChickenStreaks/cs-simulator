// The first open (flows/first-open.md): the end of the slides opens Acceso, ready for sign-up or for sign-in.
import { test, expect } from '@playwright/test';
import { openShell, noErrors, screen, waitHere, open } from './helpers.mjs';

for (const [label, slide, button, next] of [['the last «Continuar»', 'slide-4', 'onboarding-cta', 'correo'], ['«Inicia sesión»', 'slide-1', 'onboarding-sign-in', 'entrar']]) {
  test(`${label} opens Acceso and the adult lands on ${next}`, async ({ page }) => {
    await openShell(page);
    await page.evaluate(() => { WB.reset(); WB.session.signOut(); });
    await open(page, 'app.onboarding', {}, slide);
    await waitHere(page, 'app.onboarding', slide);
    await screen(page).locator(`[data-od-id="${button}"]`).click();
    await waitHere(page, 'app.access', 'rol');
    await screen(page).locator('[data-od-id="access-rol-adult"]').click();
    await waitHere(page, 'app.access', next);
    noErrors(page);
  });
}

// Bienvenida v2 (Open Design): one bird grows from egg to hen while the cards and the text slide beneath it.
test('the bird grows slide by slide and the button walks all four', async ({ page }) => {
  await openShell(page);
  await page.evaluate(() => { WB.reset(); WB.session.signOut(); });
  await open(page, 'app.onboarding');
  await waitHere(page, 'app.onboarding', 'slide-1');
  const shown = () => screen(page).locator('[data-od-id="onboarding-bird"] img').evaluateAll((imgs) =>
    imgs.filter((i) => getComputedStyle(i).opacity === '1').map((i) => i.getAttribute('src').split('/').pop()));
  await expect.poll(shown).toEqual(['huevo.png']);
  await expect(screen(page).locator('[data-od-id="onboarding-cta"]')).toHaveText('Comenzar');
  for (const [state, art] of [['slide-2', 'pollito-contenta.png'], ['slide-3', 'pollita-contenta.png'], ['slide-4', 'gallina-contenta.png']]) {
    await screen(page).locator('[data-od-id="onboarding-cta"]').click();
    await waitHere(page, 'app.onboarding', state);
    await expect.poll(shown, { timeout: 4000 }).toEqual([art]);
    await expect(screen(page).locator('[data-od-id="onboarding-cta"]')).toHaveText('Continuar');
  }
  noErrors(page);
});

test('every slide fits an iPhone without scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/simulator/screens/app/onboarding.html?still=1&as=p-mama');
  await page.waitForFunction(() => window.CSWelcome);
  await page.evaluate(() => document.fonts.ready);
  const over = await page.locator('[data-od-id^="onboarding-slide-"]').evaluateAll((s) => s.map((e) => e.scrollHeight - e.clientHeight));
  expect(over).toEqual([0, 0, 0, 0]);
});

test('from the splash, the hen lifts away and leaves the egg and the slide', async ({ page }) => {
  await openShell(page);
  await page.evaluate(() => { WB.reset(); WB.session.signOut(); });
  await open(page, 'app.onboarding', { desde: 'splash' });
  await expect(screen(page).locator('.wb-hen')).toHaveCount(1);
  await expect(screen(page).locator('.wb-hen')).toHaveCount(0, { timeout: 5000 });
  await waitHere(page, 'app.onboarding', 'slide-1');
  await expect.poll(() => screen(page).locator('.wb-dock').evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
  await screen(page).locator('[data-od-id="onboarding-cta"]').click();
  await waitHere(page, 'app.onboarding', 'slide-2');
  noErrors(page);
});
