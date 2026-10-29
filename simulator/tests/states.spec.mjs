// Every state of every catalog screen renders inside the shell: the screen loads with no page error, and a screen that
// reports its state (sim.js) reaches the state the catalog names. One test per screen, its states in order.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { openShell, open } from './helpers.mjs';

const SCREENS = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'screens.json'), 'utf8'));

for (const [id, s] of Object.entries(SCREENS)) {
  test(`[${s.owner || "?"}] ${id} — ${s.states.length} state(s) render`, async ({ page }) => {
    await openShell(page);
    const frameErrors = [];
    page.on('pageerror', (e) => frameErrors.push(e.message));
    const def = await page.evaluate((id) => WB.index.screens[id], id);
    for (const st of def.states) {
      await page.evaluate(() => sessionStorage.removeItem('wb-shell/story'));
      await open(page, id, st.params || {}, st.drive || (st.params && st.params.estado) ? st.id : null);
      // the screen loaded in the frame
      await page.waitForFunction((id) => { const c = WBShell.current(); return c.id === id; }, id, { timeout: 15000 });
      const reports = await page.evaluate(() => { try { const w = document.getElementById('sh-frame').contentWindow; return !!(w.WB && w.WB.contract); } catch (e) { return false; } });
      if (reports) {
        await page.waitForFunction(([id, state]) => {
          const h = WBShell._.here(); window.__seen = window.__seen || []; window.__seen.push(h.screen + '·' + h.state);
          return h.screen === id && h.state === state;
        }, [id, st.id], { timeout: 15000, polling: 50 }).catch(async () => {
          const seen = await page.evaluate(() => [...new Set(window.__seen || [])].slice(-6));
          throw new Error(`${id} · ${st.id} never showed (seen: ${seen.join(', ')})`);
        });
      } else {
        await expect(page.frameLocator('#sh-frame').locator('body')).not.toBeEmpty();
      }
    }
    expect(frameErrors, 'no page errors').toEqual([]);
  });
}
