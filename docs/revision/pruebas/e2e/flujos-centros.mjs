import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CAPTURAS_DIR = path.join(__dirname, 'capturas');

const UI_URL = (process.env.UI_URL || 'http://localhost:4200').replace(/\/+$/, '');
const API_URL = (process.env.API_URL || 'http://localhost:3000').replace(/\/+$/, '');

const USERS = {
  admin: { usuario: 'admin_prueba', clave: 'Admin.Prueba1' },
  user: { usuario: 'usuario_prueba', clave: 'Usuario.Prueba1' },
};

const SUFIJO = Date.now().toString().slice(-6);

fs.mkdirSync(CAPTURAS_DIR, { recursive: true });

async function loginViaUI(page, { usuario, clave }) {
  await page.goto(`${UI_URL}/login`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${UI_URL}/login`, { waitUntil: 'networkidle' });

  await page.locator('#username').fill(usuario);
  await page.locator('#password').fill(clave);
  await page.locator('button.login-submit').click();

  await page.waitForURL('**/menu-principal/dashboard', { timeout: 10000 });
  await page.waitForTimeout(2200);
}

async function limpiarModales(page) {
  try {
    const swalConfirm = page.locator('button.swal2-confirm');
    if (await swalConfirm.isVisible()) {
      await swalConfirm.click();
      await page.waitForTimeout(200);
    }
    for (const sel of ['#centroModal.show button.btn-close', '#lugarModal.show button.btn-close', '#papeletaModal.show button.btn-close']) {
      const btn = page.locator(sel);
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(300);
      }
    }
  } catch {
    // Ignorar errores de limpieza
  }
}

async function verificarSinScrollHorizontal(page, etiqueta) {
  const dims = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  if (dims.scrollWidth > dims.clientWidth) {
    throw new Error(
      `Desbordamiento horizontal en ${etiqueta}: scrollWidth=${dims.scrollWidth} > clientWidth=${dims.clientWidth}`
    );
  }
  return dims;
}

async function main() {
  const results = [];
  let browser;

  const nombreCentroCreado = `CENTRO E2E ${SUFIJO}`;
  const nombreCentroEditado = `CENTRO E2E EDITADO ${SUFIJO}`;
  const nombreCentroDesdeLugar = `POLICLINICO LUGAR ${SUFIJO}`;
  const nombreAmbienteNuevo = `AMBIENTE E2E ${SUFIJO}`;
  const dependenciaNueva = `DEPENDENCIA E2E ${SUFIJO}`;
  const nombreCentroTeclado = `CENTRO TECLADO ${SUFIJO}`;

  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      acceptDownloads: true,
    });
    const page = await context.newPage();

    async function runFlow(slug, title, fn) {
      const screenshotPath = path.join(CAPTURAS_DIR, `${slug}.png`);
      try {
        const detail = await fn();
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`[OK] ${slug}: ${title}${detail ? ` — ${detail}` : ''}`);
        results.push({ slug, ok: true, detail: detail || 'OK' });
      } catch (err) {
        try {
          await page.screenshot({ path: screenshotPath, fullPage: true });
        } catch {
          // Ignorar si no se pudo capturar
        }
        console.error(`[FALLO] ${slug}: ${title} — ${err.message}`);
        results.push({ slug, ok: false, detail: err.message });
        await limpiarModales(page);
      }
    }

    // =========================================================================
    // FLUJO (a): Admin crea centro normalizado, valida vacío/duplicado y edita
    // =========================================================================
    await runFlow(
      'centros-a-crud-admin',
      'Admin crea centro con espacios/minúsculas, valida vacío y duplicado, y edita un centro',
      async () => {
        await loginViaUI(page, USERS.admin);

        const linkMenu = page.locator('a.nav-link', { hasText: /Centros asistenciales/i }).first();
        await linkMenu.waitFor({ state: 'visible', timeout: 5000 });
        await linkMenu.click();
        await page.waitForURL('**/menu-principal/centros', { timeout: 5000 });

        const filasIniciales = await page.locator('table.es-table tbody tr').count();

        await page.locator('button[data-accion="nuevo-centro"]').click();
        const modal = page.locator('#centroModal');
        await modal.waitFor({ state: 'visible', timeout: 5000 });

        const inputNombre = modal.locator('input[name="nombre_centro"]');
        const btnGuardar = modal.locator('button[data-accion="guardar-centro"]');
        const alertaError = modal.locator('.es-field-error[role="alert"]');

        // 1. Vacío / solo espacios -> muestra error y no añade filas
        await inputNombre.fill('    ');
        await btnGuardar.click();
        await alertaError.waitFor({ state: 'visible', timeout: 5000 });
        const msgVacio = (await alertaError.innerText()).trim();
        if (msgVacio !== 'Escriba el nombre del centro asistencial.') {
          throw new Error(`Mensaje de vacío inesperado: "${msgVacio}"`);
        }

        // 2. Crear centro con espacios repetidos y minúsculas -> se normaliza
        await inputNombre.fill(`   centro   e2e   ${SUFIJO.toLowerCase()}   `);
        await btnGuardar.click();

        const filaCreada = page.locator('table.es-table tbody tr').filter({ hasText: nombreCentroCreado }).first();
        await filaCreada.waitFor({ state: 'visible', timeout: 5000 });
        const filasTrasCrear = await page.locator('table.es-table tbody tr').count();
        if (filasTrasCrear !== filasIniciales + 1) {
          throw new Error(`Se esperaban ${filasIniciales + 1} filas tras crear y hay ${filasTrasCrear}`);
        }

        // 3. Intentar crear duplicado -> muestra error "Ya existe..." y no añade filas
        await page.waitForTimeout(400);
        await page.locator('button[data-accion="nuevo-centro"]').click();
        await modal.waitFor({ state: 'visible', timeout: 5000 });
        await inputNombre.fill(`  centro  e2e   ${SUFIJO} `);
        await btnGuardar.click();

        await alertaError.waitFor({ state: 'visible', timeout: 5000 });
        const msgDup = (await alertaError.innerText()).trim();
        if (!msgDup.startsWith('Ya existe')) {
          throw new Error(`Mensaje de duplicado no empieza por "Ya existe": "${msgDup}"`);
        }
        await modal.locator('button[data-accion="cancelar-centro"]').click();
        await page.waitForTimeout(300);

        const filasTrasDup = await page.locator('table.es-table tbody tr').count();
        if (filasTrasDup !== filasTrasCrear) {
          throw new Error(`El duplicado alteró el número de filas (${filasTrasDup} vs ${filasTrasCrear})`);
        }

        // 4. Editar el centro creado
        const btnEditar = page.locator(
          `button[data-accion="editar-centro"][aria-label="Editar centro ${nombreCentroCreado}"]`
        );
        await btnEditar.click();
        await modal.waitFor({ state: 'visible', timeout: 5000 });
        await inputNombre.fill(`  centro   e2e   editado   ${SUFIJO}  `);
        await btnGuardar.click();

        const filaEditada = page.locator('table.es-table tbody tr').filter({ hasText: nombreCentroEditado }).first();
        await filaEditada.waitFor({ state: 'visible', timeout: 5000 });

        return `Creado="${nombreCentroCreado}", Editado="${nombreCentroEditado}"`;
      }
    );

    // =========================================================================
    // FLUJO (b): Crear centro desde Lugares sin perder ambiente ni dependencia
    // =========================================================================
    await runFlow(
      'centros-b-crear-desde-lugares',
      'Crear centro desde el modal de Lugares conserva ambiente y dependencia y selecciona el centro',
      async () => {
        await page.goto(`${UI_URL}/menu-principal/lugares`, { waitUntil: 'networkidle' });

        await page.locator('button:has-text("Agregar Lugar"), button:has-text("Nuevo lugar")').first().click();
        const modalLugar = page.locator('#lugarModal');
        await modalLugar.waitFor({ state: 'visible', timeout: 5000 });

        const inputAmbiente = modalLugar.locator('#nombreAmbiente');
        const inputDependencia = modalLugar.locator('#dependencia');
        await inputAmbiente.fill(nombreAmbienteNuevo);
        await inputDependencia.fill(dependenciaNueva);

        const btnNuevoCentroLugar = modalLugar.locator('button[data-accion="nuevo-centro-lugar"]');
        await btnNuevoCentroLugar.waitFor({ state: 'visible', timeout: 5000 });
        await btnNuevoCentroLugar.click();

        const inputCentro = modalLugar.locator('input[name="nombre_centro"]');
        await inputCentro.waitFor({ state: 'visible', timeout: 5000 });
        await inputCentro.fill(`  policlinico   lugar   ${SUFIJO}  `);
        await modalLugar.locator('button[data-accion="guardar-centro"]').click();

        await inputCentro.waitFor({ state: 'hidden', timeout: 5000 });

        const valAmbiente = await inputAmbiente.inputValue();
        const valDependencia = await inputDependencia.inputValue();
        if (valAmbiente !== nombreAmbienteNuevo || valDependencia !== dependenciaNueva) {
          throw new Error(
            `Se perdieron datos del formulario: ambiente="${valAmbiente}", dependencia="${valDependencia}"`
          );
        }

        const textoOpcionSeleccionada = await modalLugar
          .locator('#centro option:checked')
          .innerText();
        if (!textoOpcionSeleccionada.includes(nombreCentroDesdeLugar)) {
          throw new Error(
            `El selector #centro no seleccionó "${nombreCentroDesdeLugar}" (actual: "${textoOpcionSeleccionada}")`
          );
        }

        await modalLugar.locator('button:has-text("Guardar")').click();

        const filaLugar = page
          .locator('table.es-table tbody tr')
          .filter({ hasText: nombreAmbienteNuevo })
          .filter({ hasText: nombreCentroDesdeLugar })
          .first();
        await filaLugar.waitFor({ state: 'visible', timeout: 5000 });

        return `Lugar="${nombreAmbienteNuevo}" creado con centro="${nombreCentroDesdeLugar}"`;
      }
    );

    // =========================================================================
    // FLUJO (c): Navegación por teclado (Tab, Enter guarda, Escape cierra solo el panel)
    // =========================================================================
    await runFlow(
      'centros-c-teclado',
      'Teclado: Tab hasta + Nuevo centro, Enter abre, escribir + Enter guarda, Escape cierra solo el panel',
      async () => {
        await page.goto(`${UI_URL}/menu-principal/lugares`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(400);

        await page.locator('button:has-text("Agregar Lugar"), button:has-text("Nuevo lugar")').first().click();
        const modalLugar = page.locator('#lugarModal');
        await modalLugar.waitFor({ state: 'visible', timeout: 5000 });

        // Enfocar el elemento anterior (#dependencia o #centro) y avanzar con Tab hasta button[data-accion="nuevo-centro-lugar"]
        await modalLugar.locator('#dependencia').focus();
        let enfocado = false;
        for (let i = 0; i < 6; i++) {
          await page.keyboard.press('Tab');
          enfocado = await page.evaluate(
            () => document.activeElement?.getAttribute('data-accion') === 'nuevo-centro-lugar'
          );
          if (enfocado) break;
        }
        if (!enfocado) {
          throw new Error('No se alcanzó button[data-accion="nuevo-centro-lugar"] mediante Tab.');
        }

        await page.keyboard.press('Enter');
        const inputCentro = modalLugar.locator('input[name="nombre_centro"]');
        await inputCentro.waitFor({ state: 'visible', timeout: 5000 });

        await inputCentro.fill(`  centro   teclado   ${SUFIJO}  `);
        await inputCentro.press('Enter');

        await inputCentro.waitFor({ state: 'hidden', timeout: 5000 });
        const textoSeleccionado = await modalLugar.locator('#centro option:checked').innerText();
        if (!textoSeleccionado.includes(nombreCentroTeclado)) {
          throw new Error(`Enter no seleccionó "${nombreCentroTeclado}" (actual: "${textoSeleccionado}")`);
        }

        // Abrir de nuevo y pulsar Escape -> debe cerrar solo el panel y mantener #lugarModal abierto
        await modalLugar.locator('button[data-accion="nuevo-centro-lugar"]').click();
        await inputCentro.waitFor({ state: 'visible', timeout: 5000 });
        await inputCentro.focus();
        await page.keyboard.press('Escape');

        await inputCentro.waitFor({ state: 'hidden', timeout: 5000 });
        const modalSigueVisible = await modalLugar.isVisible();
        if (!modalSigueVisible) {
          throw new Error('Escape cerró el modal #lugarModal en lugar de cerrar únicamente el panel de centro.');
        }

        await limpiarModales(page);
        return `Centro por teclado="${nombreCentroTeclado}", Escape aisló el panel`;
      }
    );

    // =========================================================================
    // FLUJO (d): Usuario normal (sin menú, redirección de ruta, sin botón y 403 API)
    // =========================================================================
    await runFlow(
      'centros-d-permisos-usuario',
      'Usuario normal: sin enlace en menú, /menu-principal/centros redirige, sin botón en Lugares y POST API -> 403',
      async () => {
        await loginViaUI(page, USERS.user);

        const countEnlace = await page
          .locator('a.nav-link', { hasText: /Centros asistenciales/i })
          .count();
        if (countEnlace > 0) {
          throw new Error('El usuario normal no debe ver el enlace "Centros asistenciales" en el menú.');
        }

        await page.goto(`${UI_URL}/menu-principal/centros`, { waitUntil: 'networkidle' });
        await page.waitForURL('**/menu-principal/dashboard', { timeout: 5000 });

        // A8 (ajuste de Claude, 28/10/2026): antes este flujo abría «Nuevo lugar» como usuario normal para
        // comprobar que faltaba «+ Nuevo centro». Ahora el usuario normal solo consulta Lugares: se comprueba
        // que ve la lista y no ve ninguna acción de escritura, y que la API sigue respondiendo 403.
        await page.goto(`${UI_URL}/menu-principal/lugares`, { waitUntil: 'networkidle' });
        await page.locator('table.es-table tbody tr').first().waitFor({ state: 'visible', timeout: 5000 });
        const filasLugares = await page.locator('table.es-table tbody tr').count();
        const accionesVisibles = {
          nuevoLugar: await page.locator('[data-accion="nuevo-lugar"], button:has-text("Nuevo lugar")').count(),
          editar: await page.locator('[data-accion="editar-lugar"]').count(),
          eliminar: await page.locator('[data-accion="eliminar-lugar"]').count(),
          nuevoCentro: await page.locator('button[data-accion="nuevo-centro-lugar"]').count(),
        };
        for (const [accion, total] of Object.entries(accionesVisibles)) {
          if (total > 0) {
            throw new Error(`El usuario normal no debe ver la acción "${accion}" en Lugares (hay ${total}).`);
          }
        }
        if ((await page.locator('[data-permiso="solo-consulta"]').count()) !== 1) {
          throw new Error('Falta el aviso de modo consulta para el usuario normal en Lugares.');
        }
        await page.screenshot({
          path: path.join(CAPTURAS_DIR, 'centros-lugares-usuario-normal.png'),
          fullPage: true,
        });

        const tokenUsuario = await page.evaluate(() => localStorage.getItem('authToken'));
        const cabeceras = { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenUsuario}` };
        const cuerpoLugar = JSON.stringify({ nombre_ambiente: 'INTENTO E2E', dependencia: 'INTENTO E2E', id_centro: 1 });
        const estadosLugares = [
          (await fetch(`${API_URL}/api/lugares`, { method: 'POST', headers: cabeceras, body: cuerpoLugar })).status,
          (await fetch(`${API_URL}/api/lugares/1`, { method: 'PUT', headers: cabeceras, body: cuerpoLugar })).status,
          (await fetch(`${API_URL}/api/lugares/1`, { method: 'DELETE', headers: cabeceras })).status,
        ];
        if (estadosLugares.some((s) => s !== 403)) {
          throw new Error(`Lugares POST/PUT/DELETE con usuario normal devolvieron ${estadosLugares.join('/')}, se esperaba 403.`);
        }

        const resApi = await fetch(`${API_URL}/api/centros_asistenciales`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenUsuario}`,
          },
          body: JSON.stringify({ nombre_centro: 'INTENTO E2E USUARIO NORMAL' }),
        });

        if (resApi.status !== 403) {
          throw new Error(`POST directo con usuario normal devolvió ${resApi.status}, se esperaba 403.`);
        }

        return `Menú=oculto, Guard=redirigido a dashboard, Lugares=solo consulta (${filasLugares} filas, sin acciones), Lugares API=${estadosLugares.join("/")}, POST centro API=${resApi.status}`;
      }
    );

    // =========================================================================
    // FLUJO (e): Crear papeleta con el lugar del centro nuevo
    // =========================================================================
    await runFlow(
      'centros-e-papeleta-lugar-nuevo',
      'Crear una papeleta utilizando el lugar asociado al nuevo centro asistencial',
      async () => {
        await page.goto(`${UI_URL}/menu-principal/papeletas`, { waitUntil: 'networkidle' });

        await page.locator('button:has-text("Nueva Papeleta")').click();
        const modalPapeleta = page.locator('#papeletaModal');
        await modalPapeleta.waitFor({ state: 'visible', timeout: 5000 });

        await modalPapeleta.locator('select[name="id_tipo_formulario"]').selectOption({ label: 'DESPLAZAMIENTO' });

        const inputTrabOrigen = modalPapeleta.locator('input[name="trabajador_origen_nombre"]');
        await inputTrabOrigen.click();
        await inputTrabOrigen.fill('ANA');
        await modalPapeleta
          .locator('input[name="trabajador_origen_nombre"] ~ ul.list-group li.list-group-item')
          .filter({ hasText: 'ANA PRUEBA UNO' })
          .first()
          .click();

        const inputTrabDestino = modalPapeleta.locator('input[name="trabajador_destino_nombre"]');
        await inputTrabDestino.click();
        await inputTrabDestino.fill('LUIS');
        await modalPapeleta
          .locator('input[name="trabajador_destino_nombre"] ~ ul.list-group li.list-group-item')
          .filter({ hasText: 'LUIS PRUEBA DOS' })
          .first()
          .click();

        const inputLugarOrigen = modalPapeleta.locator('input[name="lugar_origen_search"]');
        await inputLugarOrigen.click();
        await inputLugarOrigen.fill('OFICINA');
        await modalPapeleta
          .locator('input[name="lugar_origen_search"] ~ ul.list-group li.list-group-item')
          .filter({ hasText: 'OFICINA 101' })
          .first()
          .click();

        const inputLugarDestino = modalPapeleta.locator('input[name="lugar_destino_nombre"]');
        await inputLugarDestino.click();
        await inputLugarDestino.fill(nombreAmbienteNuevo);
        const itemDestino = modalPapeleta
          .locator('input[name="lugar_destino_nombre"] ~ ul.list-group li.list-group-item')
          .filter({ hasText: nombreAmbienteNuevo })
          .first();
        await itemDestino.waitFor({ state: 'visible', timeout: 5000 });
        await itemDestino.click();

        const inputEquipo = modalPapeleta.locator('input[name="equipoSearchText"]');
        await inputEquipo.click();
        await inputEquipo.fill('74080003');
        const itemEquipo = modalPapeleta
          .locator('.dropdown-menu.show .dropdown-item')
          .filter({ hasText: '74080003' })
          .first();
        await itemEquipo.waitFor({ state: 'visible', timeout: 5000 });
        await itemEquipo.click();

        await modalPapeleta.locator('button:has-text("Guardar Papeleta")').click();

        const toastTitle = page.locator('.swal2-popup.es-toast #swal2-title');
        await toastTitle.waitFor({ state: 'visible', timeout: 5000 });
        const textoExito = (await toastTitle.innerText()).trim();
        const matchNumero = textoExito.match(/PA-\d{4}/);
        if (!matchNumero) {
          throw new Error(`El aviso de éxito no mostró número PA-NNNN: "${textoExito}"`);
        }

        return `Papeleta creada="${matchNumero[0]}" con lugar="${nombreAmbienteNuevo}"`;
      }
    );

    // =========================================================================
    // FLUJO (f): Capturas 1440x900 y móvil 390x844 sin desplazamiento horizontal
    // =========================================================================
    await runFlow(
      'centros-f-responsive-capturas',
      'Capturas escritorio (1440x900) y móvil (390x844) de Centros y Lugares sin scroll horizontal en móvil',
      async () => {
        await loginViaUI(page, USERS.admin);

        // Escritorio 1440x900
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`${UI_URL}/menu-principal/centros`, { waitUntil: 'networkidle' });
        await page.screenshot({
          path: path.join(CAPTURAS_DIR, 'centros-escritorio-1440x900.png'),
          fullPage: true,
        });

        await page.goto(`${UI_URL}/menu-principal/lugares`, { waitUntil: 'networkidle' });
        await page.screenshot({
          path: path.join(CAPTURAS_DIR, 'centros-lugares-escritorio-1440x900.png'),
          fullPage: true,
        });

        // Móvil 390x844
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(`${UI_URL}/menu-principal/centros`, { waitUntil: 'networkidle' });
        const dimsCentros = await verificarSinScrollHorizontal(page, 'Centros móvil 390x844');
        await page.screenshot({
          path: path.join(CAPTURAS_DIR, 'centros-movil-390x844.png'),
          fullPage: true,
        });

        await page.goto(`${UI_URL}/menu-principal/lugares`, { waitUntil: 'networkidle' });
        const dimsLugares = await verificarSinScrollHorizontal(page, 'Lugares móvil 390x844');
        await page.screenshot({
          path: path.join(CAPTURAS_DIR, 'centros-lugares-movil-390x844.png'),
          fullPage: true,
        });

        return `Centros móvil (${dimsCentros.scrollWidth}/${dimsCentros.clientWidth}px), Lugares móvil (${dimsLugares.scrollWidth}/${dimsLugares.clientWidth}px)`;
      }
    );
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  const fallos = results.filter((r) => !r.ok);
  console.log('\n============================================================');
  console.log(`Resumen E2E Centros: ${results.length - fallos.length}/${results.length} flujos en OK`);
  for (const r of results) {
    console.log(` - [${r.ok ? 'OK' : 'FALLO'}] ${r.slug}: ${r.detail}`);
  }
  console.log('============================================================');
  if (fallos.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Error fatal ejecutando E2E de centros:', err);
  process.exitCode = 1;
});
