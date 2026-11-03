// c005 F1/F2: ejecutar únicamente contra una instalación de demostración desechable.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UI = process.env.UI_URL || 'http://localhost:18080';
const encargo = process.env.E2E_ENCARGO || 'c005';
const origen = new URL(UI).origin;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ acceptDownloads: true });
const externas = [], violaciones = [];
await page.addInitScript(() => {
  window.addEventListener('securitypolicyviolation', e => console.error('CSP_C005:' + e.violatedDirective + ':' + e.blockedURI));
});
page.on('console', m => { if (m.text().startsWith('CSP_C005:')) violaciones.push(m.text()); });
await page.route('**/*', route => {
  const url = new URL(route.request().url());
  if (['http:', 'https:'].includes(url.protocol) && url.origin !== origen) {
    externas.push(url.origin); return route.abort();
  }
  return route.continue();
});
async function api(ruta, token, body, method = 'GET') {
  const res = await page.request.fetch(UI + '/api/' + ruta, {
    method, headers: token ? { Authorization: 'Bearer ' + token } : {}, data: body
  });
  return { status: res.status(), body: await res.json() };
}
try {
  const ruta = await page.goto(UI + '/menu-principal/papeletas', { waitUntil: 'networkidle' });
  assert.equal(ruta.status(), 200);
  assert.match(await ruta.text(), /<app-root>/);
  const headers = ruta.headers();
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.ok(headers['content-security-policy'].includes("connect-src 'self'"));
  assert.ok(!headers.server.includes('/'));
  assert.equal((await api('salud/lista')).status, 200);
  const admin = await api('auth/login', null, { nombreUsuario: 'admin_prueba', contrasena: 'Admin.Prueba1' }, 'POST');
  const user = await api('auth/login', null, { nombreUsuario: 'usuario_prueba', contrasena: 'Usuario.Prueba1' }, 'POST');
  assert.equal(admin.status, 200); assert.equal(user.status, 200);
  const token = admin.body.token, sufijo = Date.now();
  const centro = await api('centros_asistenciales', token, { nombre_centro: 'CENTRO DOCKER ' + sufijo }, 'POST');
  assert.equal(centro.status, 200);
  const lugar = await api('lugares', token, { nombre_ambiente: 'AMBIENTE DOCKER ' + sufijo, dependencia: 'DEPENDENCIA DOCKER', id_centro: centro.body.data.id_centro }, 'POST');
  assert.equal(lugar.status, 200);
  const papeleta = await api('papeletas', token, { id_tipo_formulario: 3, id_trabajador_origen: 1, id_trabajador_destino: 2,
    id_lugar_origen: 1, id_lugar_destino: lugar.body.data.id_lugar, fecha: '2026-10-28', equipmentIds: [1] }, 'POST');
  assert.equal(papeleta.status, 200);
  const id = papeleta.body.data.id_papeleta;
  assert.equal((await api('papeletas/' + id, user.body.token, undefined, 'DELETE')).status, 403);
  await page.goto(UI + '/login', { waitUntil: 'networkidle' });
  await page.locator('#username').fill('admin_prueba');
  await page.locator('#password').fill('Admin.Prueba1');
  await page.locator('.login-submit').click();
  await page.waitForURL('**/menu-principal/**');
  await page.goto(UI + '/menu-principal/papeletas', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  const numero = papeleta.body.data.numero_papeleta;
  const fila = page.locator('table tbody tr').filter({ hasText: numero }).first();
  await fila.waitFor();
  const descargando = page.waitForEvent('download');
  await fila.locator('[title="Imprimir PDF"]').click();
  const descarga = await descargando;
  const archivo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), `../logs/${encargo}-docker-papeleta.pdf`);
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  await descarga.saveAs(archivo);
  assert.ok(fs.readFileSync(archivo).toString('latin1').startsWith('%PDF-'));
  assert.deepEqual(externas, []);
  assert.deepEqual(violaciones, []);
  assert.equal(await page.evaluate(() => document.fonts.check('400 16px Inter')), true);
  const css = await page.locator('link[rel=stylesheet]').first().getAttribute('href');
  const recurso = await page.request.get(new URL(css, UI).href);
  assert.match(recurso.headers()['cache-control'], /immutable/);
  const index = await page.request.get(UI + '/index.html');
  assert.equal(index.headers()['cache-control'], 'no-store');
  console.log('c005 F1/F2: SPA, salud, 2 login, centro, lugar, papeleta ' + numero + ', PDF, DELETE 403, cabeceras, caché y fuente local: OK.');
  console.log('Solicitudes externas: 0; violaciones CSP: 0.');
} finally { await browser.close(); }
