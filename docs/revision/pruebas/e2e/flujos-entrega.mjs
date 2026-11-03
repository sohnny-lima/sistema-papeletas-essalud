// c001: ejecutar con backend :3000 contra una base temporal, nunca bd_papeleta_test.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UI = process.env.UI_URL || 'http://localhost:4200';
const API = process.env.API_URL || 'http://localhost:3000';
const directorio = path.dirname(fileURLToPath(import.meta.url));
const salida = path.resolve(directorio, '../logs');
// En un checkout limpio (CI) la carpeta de registros puede no existir.
fs.mkdirSync(salida, { recursive: true });
const encargo = process.env.E2E_ENCARGO || 'c001';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1366, height: 900 } });
let fallos = 0, total = 0;
async function flujo(nombre, fn) {
  total++;
  try { await fn(); console.log(`OK ${nombre}`); }
  catch (err) { fallos++; console.error(`FALLO ${nombre}: ${err.stack}`); }
}
async function formulario(clave = 'Usuario.Prueba1') {
  await page.goto(`${UI}/login`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.locator('#username').fill('usuario_prueba');
  await page.locator('#password').fill(clave);
  await page.locator('.login-submit').click();
}
async function textoError(mensaje) {
  await page.locator('#login-error').waitFor();
  assert.ok((await page.locator('#login-error').innerText()).includes(mensaje));
}
async function login() { await formulario(); await page.waitForURL('**/menu-principal/dashboard'); }
try {
  await flujo('F5/A2 clave errónea: credenciales', async () => {
    await formulario('Incorrecta.123'); await textoError('Usuario o contraseña incorrectos.');
  });
  await flujo('F5 URL de login inaccesible: conexión', async () => {
    await page.route('**/api/auth/login', ruta => ruta.abort('connectionrefused'));
    try { await formulario(); await textoError('No se pudo conectar con el servidor.'); }
    finally { await page.unroute('**/api/auth/login'); }
  });
  await flujo('A9 token caducado en localStorage: login con motivo', async () => {
    await page.evaluate(() => localStorage.setItem('authToken', `e30.${btoa(JSON.stringify({ exp: 1, rol: 'user' }))}.firma`));
    await page.goto(`${UI}/menu-principal/equipos`, { waitUntil: 'networkidle' });
    assert.ok(page.url().includes('/login'));
    await textoError('Su sesión ha caducado. Vuelva a iniciar sesión.');
    assert.equal(await page.evaluate(() => localStorage.getItem('authToken')), null);
  });
  await flujo('A9 g008 un 401 autenticado muestra el login sin alerta adicional', async () => {
    await login();
    const ruta = /\/api\/equipos(?:\?|$)/;
    await page.route(ruta, peticion => peticion.fulfill({
      status: 401, contentType: 'application/json',
      body: JSON.stringify({ success: false, message: 'Token caducado' })
    }));
    try {
      await page.goto(`${UI}/menu-principal/equipos`, { waitUntil: 'networkidle' });
      await page.waitForURL('**/login?sesion=caducada');
      await textoError('Su sesión ha caducado. Vuelva a iniciar sesión.');
      assert.equal(await page.locator('.swal2-popup').count(), 0);
      assert.equal(await page.evaluate(() => localStorage.getItem('authToken')), null);
    } finally { await page.unroute(ruta); }
  });
  await flujo('A8 usuario normal crea y edita equipo, sin Eliminar', async () => {
    await login(); await page.goto(`${UI}/menu-principal/equipos`, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('button[title="Eliminar"]').count(), 0);
    await page.getByRole('button', { name: /Agregar Equipo/i }).click();
    const codigo = '7499' + String(Date.now()).slice(-8);
    for (const [campo, valor] of Object.entries({ cod_patrimonial: codigo, descripcion: 'EQUIPO ENTREGA', marca: 'MARCA', serie: 'SERIE', modelo: 'MODELO' })) {
      await page.locator(`#equipoModal [name="${campo}"]`).fill(valor);
    }
    const creado = page.waitForResponse(res => res.url().includes('/api/equipos') && res.request().method() === 'POST');
    await page.locator('#equipoModal').getByRole('button', { name: /Guardar Cambios/i }).click(); assert.equal((await creado).status(), 200);
    await page.locator('#equipoModal').waitFor({ state: 'hidden' });
    // El listado está paginado; buscar el código antes de editar.
    await page.locator('input[placeholder*="Buscar"]').fill(codigo);
    const fila = page.locator('table tbody tr').filter({ hasText: codigo });
    await fila.waitFor(); await fila.locator('button[title="Editar"]').click();
    await page.locator('#equipoModal [name="descripcion"]').fill('EQUIPO ENTREGA EDITADO');
    const editado = page.waitForResponse(res => res.url().includes('/api/equipos/') && res.request().method() === 'PUT');
    await page.locator('#equipoModal').getByRole('button', { name: /Guardar Cambios/i }).click(); assert.equal((await editado).status(), 200);
    await page.locator('#equipoModal').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelector('table')?.textContent.includes('EQUIPO ENTREGA EDITADO'));
    assert.equal(await page.locator('button[title="Eliminar"]').count(), 0);
  });
  for (const sinLogo of [false, true]) {
    await flujo(`P8/P9 descarga PDF y orden del texto${sinLogo ? ' sin logo' : ''}`, async () => {
      await login();
      const token = await page.evaluate(() => localStorage.getItem('authToken'));
      const detalle = await (await page.request.get(`${API}/api/papeletas/1`, { headers: { Authorization: `Bearer ${token}` } })).json();
      assert.notEqual(detalle.data.lugar_origen_ambiente, detalle.data.lugar_origen_dependencia);
      assert.notEqual(detalle.data.lugar_destino_ambiente, detalle.data.lugar_destino_dependencia);
      if (sinLogo) await page.route('**/assets/logo4.png', ruta => ruta.abort());
      try {
        await page.goto(`${UI}/menu-principal/papeletas`, { waitUntil: 'networkidle' });
        const descarga = page.waitForEvent('download');
        await page.locator('table tbody tr').filter({ hasText: 'PA-0001' }).first().locator('[title="Imprimir PDF"]').click();
        const pdf = await descarga; const archivo = path.join(salida, `${encargo}-papeleta${sinLogo ? '-sin-logo' : ''}.pdf`);
        await pdf.saveAs(archivo);
        const texto = fs.readFileSync(archivo).toString('latin1'); assert.ok(texto.startsWith('%PDF-'));
        // jsPDF emite estos textos sin compresión. Comprueba las etiquetas y valores de ambos bloques.
        let desde = 0;
        for (const lado of ['origen', 'destino']) {
          for (const [etiqueta, valor] of [['DEPENDENCIA:', detalle.data[`lugar_${lado}_dependencia`]], ['AMBIENTE:', detalle.data[`lugar_${lado}_ambiente`]]]) {
            const posEtiqueta = texto.indexOf(`(${etiqueta})`, desde);
            assert.ok(posEtiqueta >= desde, `Falta ${etiqueta} de ${lado}`);
            const posValor = texto.indexOf(`(${valor})`, posEtiqueta);
            assert.ok(posValor > posEtiqueta, `Falta ${valor} tras ${etiqueta}`);
            const siguienteEtiqueta = texto.indexOf(' Tj', posEtiqueta) + 3;
            assert.ok(texto.slice(siguienteEtiqueta, posValor).indexOf('(AMBIENTE:)') === -1, 'Dependencia fuera de orden');
            desde = posValor + valor.length + 2;
          }
        }
        console.log(`  PDF guardado: ${path.basename(archivo)}`);
      } finally { if (sinLogo) await page.unroute('**/assets/logo4.png'); }
    });
  }
} finally { await browser.close(); }
console.log(`Resumen entrega: ${total - fallos}/${total} flujos en OK`);
if (fallos) process.exitCode = 1;
