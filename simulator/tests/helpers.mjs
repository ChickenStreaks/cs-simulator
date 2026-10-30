// Shared helpers of the simulator's specs.
import { expect } from '@playwright/test';

// network noise that is not the simulator's: Google Fonts may be unreachable offline
const NOISE = /fonts\.(googleapis|gstatic)\.com|Failed to load resource|is not allowed by Access-Control-Allow-Origin/;   // the last: WebKit's line for a font a capture cannot fetch

// Opens «Use the app» (app.html). hash: '#app.pin?paso=bloqueo'
export async function openShell(page, { hash = '' } = {}) {
  const errors = [];
  page.on('pageerror', (e) => { if (!NOISE.test(e.message)) errors.push(e.message); });   // WebKit reports a blocked logo fetch as a page error
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(m.text()); });
  page.__errors = errors;
  await page.goto('/simulator/app.html' + hash);
  await page.waitForFunction(() => window.WBShell && window.WB && window.WB.index);
  return page;
}
export function noErrors(page) { expect(page.__errors || [], 'no page errors').toEqual([]); }

// the screen inside the shell
export function screen(page) { return page.frameLocator('#sh-frame'); }
export async function here(page) { return page.evaluate(() => window.WBShell.here()); }
export async function waitHere(page, screenId, state, timeout = 12000) {
  await page.waitForFunction(([s, st]) => { const h = window.WBShell.here(); return h.screen === s && (!st || h.state === st); }, [screenId, state], { timeout });
}
export async function open(page, id, params = {}, state = null) {
  await page.evaluate(([id, params, state]) => window.WBShell.open(id, params, state ? { state } : {}), [id, params, state]);
}

// Addition 18: the shell's history (its «Regresar»), and how many backs it takes to reach a screen (-1: never, in max)
export async function routeIds(page) { return page.evaluate(() => WBShell.routes().map((r) => r.id)); }
// a screen is in the history once its frame has loaded (here() changes as soon as the navigation starts)
export async function landed(page, screenId, timeout = 15000) { await page.waitForFunction((s) => { const r = WBShell.routes(); return r.length && r[r.length - 1].id === s && document.getElementById('sh-frame').contentWindow.WB; }, screenId, { timeout }); }
export async function backsTo(page, screenId, max = 6) {
  for (let n = 0; n <= max; n++) {
    if ((await page.evaluate(() => WBShell.here().screen)) === screenId) return n;
    if (n === max) break;
    const before = await page.evaluate(() => location.href + '|' + document.getElementById('sh-frame').contentWindow.location.href);
    await page.evaluate(() => WBShell.back());
    await page.waitForFunction((b) => location.href + '|' + document.getElementById('sh-frame').contentWindow.location.href !== b, before, { timeout: 8000 }).catch(() => {});
    await page.waitForFunction(() => window.WBShell.here().screen, null, { timeout: 8000 });
  }
  return -1;
}
