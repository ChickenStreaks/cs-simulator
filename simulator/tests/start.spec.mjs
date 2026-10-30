// The first open (flows/first-open.md): until sign-up and sign-in exist, the end of the slides enters as Mamá and opens
// her home (DECISIONS F7) — whoever «See as» showed before.
import { test, expect } from '@playwright/test';
import { openShell, noErrors, screen, waitHere, open } from './helpers.mjs';

for (const [label, slide, button] of [['the last «Continuar»', 'slide-4', 'onboarding-cta'], ['«Inicia sesión»', 'slide-1', 'onboarding-sign-in']]) {
  test(`${label} signs in as Mamá and opens her home, even from Kids`, async ({ page }) => {
    await openShell(page);
    await page.evaluate(() => { WB.reset(); WB.viewAs.set('p-sofia'); WB.session.signOut(); });
    await open(page, 'app.onboarding', {}, slide);
    await waitHere(page, 'app.onboarding', slide);
    await screen(page).locator(`[data-od-id="${button}"]`).click();
    await waitHere(page, 'app.today');
    // the frame wrote it; the shell hears it through the storage event, a moment later
    await expect.poll(() => page.evaluate(() => [WB.session.get().signedIn, WB.viewAs.get().person])).toEqual([true, 'p-mama']);
    noErrors(page);
  });
}
