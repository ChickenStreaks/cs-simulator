// Every guided story, walked (inspiration idea 2, Addition 24): «Siguiente» only, from the first step to «Terminar», each step
// on its screen and state. A story that asks to change «Ver como» by hand keeps its own walk in its lane's spec; missions
// («coach»: false) have no steps. When this fails, the lane that owns the story fixes the story or the screen.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { openShell, noErrors } from './helpers.mjs';

const box = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'generated', 'index.js'), 'utf8'), box);
const MANUAL = /«Ver como»|míralo como/i;   // a step the visitor does in the bar, not the coach
const STORIES = (box.window.WB_INDEX.stories || []).filter((s) => s.coach !== false && !s.steps.some((p) => MANUAL.test(p.text + ' ' + (p.sub || ''))));

for (const story of STORIES) {
  test(`story «${story.title}» (${story.lane}) walks to «Terminar» with «Siguiente» only`, async ({ page }) => {
    test.skip(test.info().project.name === 'webkit-iphone-se', 'Chromium and iPhone 15');
    test.setTimeout(30000 + story.steps.length * 12000);
    await openShell(page);
    const stories = page.locator('#sh-bar [data-sh="stories"]');
    if (await stories.isVisible()) await stories.click(); else { await page.locator('#sh-bar [data-sh="menu"]').click(); await page.locator('[data-testid="sh-m-stories"]').click(); }
    await page.locator(`[data-testid="sh-story-${story.id}"]`).click();
    const coach = page.locator('[data-testid="sh-coach"]');
    for (let n = 1; n <= story.steps.length; n++) {
      const step = story.steps[n - 1];
      await expect(coach, `step ${n}`).toHaveAttribute('data-step', String(n), { timeout: 20000 });
      await expect.poll(async () => {
        const h = await page.evaluate(() => WBShell._.here());
        return h.screen === step.screen && (!step.state || step.state === '*' || [].concat(step.state).includes(h.state)) ? 'ok' : h.screen + '·' + h.state;
      }, { message: `step ${n} shows ${step.screen}${step.state ? ' · ' + [].concat(step.state).join('|') : ''}`, timeout: 15000 }).toBe('ok');
      for (let k = 0; k < 4; k++) {
        await page.locator('[data-testid="sh-coach-next"]:not([aria-disabled="true"])').click({ timeout: 15000 });
        if (n === story.steps.length) break;
        if (await expect(coach).toHaveAttribute('data-step', String(n + 1), { timeout: 4000 }).then(() => true, () => false)) break;
      }
    }
    await expect(page.locator('[data-panel="end"]')).toBeVisible({ timeout: 15000 });
    noErrors(page);
  });
}

test('the walk covers every guided story but those with a manual «Ver como» step', () => {
  const all = (box.window.WB_INDEX.stories || []).filter((s) => s.coach !== false);
  expect(STORIES.length).toBeGreaterThan(0);
  expect(all.length - STORIES.length).toBeLessThanOrEqual(3);   // people ×2 and rules today; a new one needs its own walk
});
