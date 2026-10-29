// build-screens --render: opens every state of every catalog screen in Chromium, through the shell, and fails on a page
// error or a state that never shows. It is the suite's states.spec.mjs (one source), run alone.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TESTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'tests');
export async function renderAll() {
  const r = spawnSync('npx', ['playwright', 'test', 'states.spec.mjs', '--project=chromium', '--reporter=line'], { cwd: TESTS, stdio: 'inherit' });
  return r.status === null ? 1 : r.status;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await renderAll());
