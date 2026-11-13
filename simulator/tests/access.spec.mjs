// Acceso (flows/access.md): the adult's sign-up and sign-in, and a kid's code.
import { test, expect } from '@playwright/test';
import { openShell, noErrors, screen, waitHere, open } from './helpers.mjs';

const od = (page, id) => screen(page).locator(`[data-od-id="${id}"]`);
async function start(page, state, params = {}) {
  await openShell(page);
  await page.evaluate(() => { WB.reset(); WB.viewAs.set('p-sofia'); WB.session.signOut(); });
  await open(page, 'app.access', params, state);
  await waitHere(page, 'app.access', state);
}
async function dial(page, code) { for (const n of code) await od(page, `access-key-${n}`).click(); }
// the frame wrote it; the shell hears it through the storage event, a moment later
const signedInAs = (page, who) => expect.poll(() => page.evaluate(() => [WB.session.get().signedIn, WB.viewAs.get().person])).toEqual([true, who]);

test('sign-up walks to Mamá\'s home, and no step passes when wrong', async ({ page }) => {
  await start(page, 'correo');
  await od(page, 'access-su-email').fill('lucia@correo.ejemplo');
  await od(page, 'access-su-pass').fill('una-clave-larga');
  await od(page, 'access-correo-signup').click();
  await expect(od(page, 'access-su-email-err')).toContainText('ya tiene una cuenta');
  await od(page, 'access-su-email').fill('nueva@correo.ejemplo');
  await od(page, 'access-correo-signup').click();
  await waitHere(page, 'app.access', 'verificar');
  await od(page, 'access-vf-code').fill('999999');   // the sixth number checks it
  await expect(od(page, 'access-vf-code-err')).toContainText('no coincide');
  await expect(od(page, 'access-vf-code')).toHaveValue('');
  await od(page, 'access-vf-code').fill('123456');
  await waitHere(page, 'app.access', 'adulto');
  await od(page, 'access-adulto-consent').click();
  await expect(od(page, 'access-ad-err')).toBeVisible();
  await expect(od(page, 'access-ad-age')).not.toBeChecked();   // privacidad R1: never ticked for them
  await od(page, 'access-ad-age').check();
  await od(page, 'access-ad-terms').check();
  await od(page, 'access-adulto-consent').click();
  await waitHere(page, 'app.access', 'preparando');
  await waitHere(page, 'app.access', 'listo');
  await od(page, 'access-listo-enter-adult').click();
  await waitHere(page, 'app.today');
  await signedInAs(page, 'p-mama');
  noErrors(page);
});

test('sign-in refuses a wrong password, then enters as Mamá', async ({ page }) => {
  await start(page, 'entrar');
  await od(page, 'access-en-email').fill('lucia@correo.ejemplo');
  await od(page, 'access-en-pass').fill('incorrecta');
  await od(page, 'access-entrar-login').click();
  await expect(od(page, 'access-en-pass-err')).toContainText('no coinciden');
  await od(page, 'access-en-pass').fill('la-buena');
  await od(page, 'access-entrar-login').click();
  await waitHere(page, 'app.today');
  await signedInAs(page, 'p-mama');
  noErrors(page);
});

test('a forgotten password is replaced by code and returns to sign-in', async ({ page }) => {
  await start(page, 'recuperar');
  await od(page, 'access-rc-email').fill('lucia@correo.ejemplo');
  await od(page, 'access-recuperar-recover').click();
  await waitHere(page, 'app.access', 'rc-codigo');
  await od(page, 'access-rc-code').fill('123456');
  await waitHere(page, 'app.access', 'nueva');
  await od(page, 'access-rn-pass').fill('corta');
  await od(page, 'access-nueva-save-pass').click();
  await expect(od(page, 'access-rn-pass-err')).toBeVisible();
  await od(page, 'access-rn-pass').fill('una-clave-larga');
  await od(page, 'access-nueva-save-pass').click();
  await waitHere(page, 'app.access', 'renovada');
  await od(page, 'access-renovada-after-reset').click();
  await waitHere(page, 'app.access', 'entrar');
  noErrors(page);
});

test('the hen closes her eyes on a hidden password only', async ({ page }) => {
  await start(page, 'entrar');
  const shut = screen(page).locator('[data-screen="entrar"] .perch');
  await od(page, 'access-en-pass').focus();
  await expect(shut).toHaveClass(/is-shut/);
  await od(page, 'access-entrar-eye').click();
  await expect(shut).not.toHaveClass(/is-shut/);
  noErrors(page);
});

test('a kid\'s code opens that kid, a wrong one clears the slots', async ({ page }) => {
  await start(page, 'codigo');
  await dial(page, '999999');
  await expect(od(page, 'access-code-err')).toBeVisible();
  await expect(od(page, 'access-code-slots').locator('span').first()).toHaveText('');
  await dial(page, '735924');
  await waitHere(page, 'app.access', 'hola');
  await expect(od(page, 'access-hola')).toContainText('¡Hola, Mateo!');
  await od(page, 'access-hola-kid-enter').click();
  await waitHere(page, 'app.kid');
  await signedInAs(page, 'p-mateo');
  noErrors(page);
});

test('every step fits an iPhone with no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.emulateMedia({ reducedMotion: 'reduce' });   // the steps slide in sideways otherwise
  for (const s of ['rol', 'correo', 'verificar', 'adulto', 'aviso', 'preparando', 'listo', 'entrar', 'recuperar', 'rc-codigo', 'nueva', 'renovada', 'codigo', 'sincodigo', 'hola']) {
    await page.goto(`/simulator/screens/app/access.html?still=1&as=p-mama&estado=${s}`);
    await page.waitForSelector(`[data-screen="${s}"]:not([hidden])`);
    await page.evaluate(() => document.fonts.ready);
    const [wide, tall] = await page.locator('#content').evaluate((e) => [e.scrollWidth - e.clientWidth, e.scrollHeight - e.clientHeight]);
    expect([s, wide]).toEqual([s, 0]);
    expect([s, tall <= 0]).toEqual([s, true]);
  }
});
