// «See the screens» (gallery.html): every state of every app screen as a small live phone, grouped by flow in the
// flow docs' order. Thumbnails are stills: looking never saves and never moves on. A click opens the screen in the app.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { waitHere } from './helpers.mjs';

const SCREENS = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'screens.json'), 'utf8'));
const STATES = Object.entries(SCREENS).filter(([id]) => !id.startsWith('dev.')).reduce((n, [, s]) => n + s.states.length, 0);

test('every state of every app screen, by who sees it, then grouped by flow in order', async ({ page }) => {
  await page.goto('/simulator/gallery.html');
  await expect(page.locator('[data-testid="gal-section"] > h2')).toHaveText(['Before signing in', 'Parent', 'Kid']);
  const flows = (key) => page.locator(`[data-testid="gal-section"][data-for="${key}"] [data-testid="gal-group"] h3`);
  await expect(flows('anyone')).toHaveText(['First open', 'Access']);
  await expect(flows('adult')).toHaveText(['Access', 'The daily loop']);   // every prize state is seen as Sofía
  await expect(flows('kid')).toHaveText(['Access', 'The daily loop', 'Prizes']);
  await expect(page.locator('[data-for="kid"] [data-screen="app.access"]')).toHaveCount(3);   // the kid's code, no code, hello
  await expect(page.locator('[data-for="adult"] [data-screen="app.today"]')).toHaveCount(3);
  await expect(page.locator('[data-testid="gal-item"]')).toHaveCount(STATES);
});

test('a first visit to the gallery saves nothing, and the splash stays a splash', async ({ page }) => {
  await page.goto('/simulator/gallery.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('[data-testid="gal-item"] iframe').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(7000);
  expect(await page.evaluate(() => localStorage.getItem('cs-sim/v1'))).toBeNull();
  expect(await page.evaluate(() => document.querySelector('[data-testid="gal-item"] iframe').contentWindow.location.pathname)).toMatch(/splash/);
});

test('a thumbnail opens its screen and state in the app', async ({ page }) => {
  await page.goto('/simulator/gallery.html');
  await page.locator('[data-testid="gal-item"][data-screen="app.onboarding"][data-state="slide-3"]').click();
  await page.waitForFunction(() => window.WBShell && window.WB && window.WB.index);
  await waitHere(page, 'app.onboarding', 'slide-3');
});
