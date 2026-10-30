// The simulator's Playwright suite: Chromium at desktop width, and WebKit as iPhone 15 (Safari's engine: sticky bars,
// the keyboard and the visual viewport only misbehave there). It starts its own «like production» server
// (tools/serve.mjs: pretty URLs, committed generated files).
// Run: cd simulator/tests && npx playwright test   ·   one project: --project=chromium   ·   setup: tools/setup-tests.sh
// Workers: at most 3 browsers (tools/workers.sh); WB_WORKERS overrides.
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { devices } from '@playwright/test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// ponytail: one lane; Wirebit's per-lane ports and folders come back if lanes run in parallel worktrees
const LANE = process.env.WB_LANE || 'shell';
const OUT = path.join(os.homedir(), '.cache', 'claude-builds', 'cs-simulator', LANE, 'results');
const PORT = Number(process.env.WB_TEST_PORT || 4713);
const WK = process.env.WB_WEBKIT_EXEC || path.join(os.homedir(), '.cache', 'claude-builds', 'cs-simulator', 'webkit-libs', 'pw_wk.sh');
function workers() {
  if (process.env.WB_WORKERS) return Number(process.env.WB_WORKERS);
  try { return Number(execFileSync(path.join(HERE, '..', 'tools', 'workers.sh'), ['--max', '3']).toString().trim()) || 1; } catch { return 1; }
}
const webkit = (device) => ({ ...devices[device], browserName: 'webkit', launchOptions: fs.existsSync(WK) ? { executablePath: WK } : {} });

export default {
  testDir: HERE,
  testMatch: /.*\.spec\.mjs$/,
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  workers: workers(),
  retries: 0,
  outputDir: path.join(OUT, 'artifacts'),
  reporter: [['list'], ['json', { outputFile: path.join(OUT, 'results.json') }]],
  use: {
    baseURL: process.env.WB_URL || `http://127.0.0.1:${PORT}`,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
    { name: 'webkit-iphone15', use: webkit('iPhone 15') }
  ],
  webServer: process.env.WB_URL ? undefined : {
    command: `node ${path.join(HERE, '..', 'tools', 'serve.mjs')} ${PORT}`,
    url: `http://127.0.0.1:${PORT}/simulator/`,
    reuseExistingServer: false
  }
};
