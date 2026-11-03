import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CAPTURAS_DIR = path.join(__dirname, 'capturas');

const API_URL = (process.env.API_URL || 'http://localhost:3000').replace(/\/+$/, '');
const UI_URL = (process.env.UI_URL || 'http://localhost:4200').replace(/\/+$/, '');

const USERS = {
  admin: { usuario: 'admin_prueba', clave: 'Admin.Prueba1' },
  user: { usuario: 'usuario_prueba', clave: 'Usuario.Prueba1' },
};

fs.mkdirSync(CAPTURAS_DIR, { recursive: true });

/**
 * Inicia sesión desde /login usando los selectores reales de login.component.html:
 * - #username (frontend-papeletas/src/app/login/login.component.html:16-23)
 * - #password (frontend-papeletas/src/app/login/login.component.html:31-38)
 * - button.login-submit (frontend-papeletas/src/app/login/login.component.html:58-62)
 */
async function loginViaUI(page, { usuario, clave }) {
  await page.goto(`${UI_URL}/login`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${UI_URL}/login`, { waitUntil: 'networkidle' });

  // login.component.html:16-23 (<input type="text" id="username" name="username" ...>)
  await page.locator('#username').fill(usuario);
  // login.component.html:31-38 (<input ... id="password" name="password" ...>)
  await page.locator('#password').fill(clave);
  // login.component.html:58-62 (<button type="submit" ... class="login-submit">)
  await page.locator('button.login-submit').click();

  await page.waitForURL('**/menu-principal/dashboard', { timeout: 10000 });
}

/**
 * Rellena los campos obligatorios de una papeleta en el modal #papeletaModal
 * usando los selectores de frontend-papeletas/src/app/papeletas/papeletas.component.html.
 */
async function fillCamposBasePapeleta(page, { incluirEquipo = true } = {}) {
  // papeletas.component.html:267-273 (<select class="form-select rounded-xl" [(ngModel)]="papeleta.id_tipo_formulario" name="id_tipo_formulario">)
  const selectTipo = page.locator('#papeletaModal select[name="id_tipo_formulario"]');
  await selectTipo.selectOption({ label: 'DESPLAZAMIENTO' });

  // papeletas.component.html:281-286 (<input type="text" ... name="trabajador_origen_nombre" ...>)
  const inputTrabOrigen = page.locator('#papeletaModal input[name="trabajador_origen_nombre"]');
  await inputTrabOrigen.click();
  await inputTrabOrigen.fill('ANA');
  // papeletas.component.html:287-296 (<ul class="list-group ..."><li class="list-group-item ..." (click)="selectTrabajadorOrigen(t)">)
  const itemTrabOrigen = page
    .locator('#papeletaModal input[name="trabajador_origen_nombre"] ~ ul.list-group li.list-group-item')
    .filter({ hasText: 'ANA PRUEBA UNO' })
    .first();
  await itemTrabOrigen.waitFor({ state: 'visible', timeout: 5000 });
  await itemTrabOrigen.click();

  // papeletas.component.html:301-306 (<input type="text" ... name="trabajador_destino_nombre" ...>)
  const inputTrabDestino = page.locator('#papeletaModal input[name="trabajador_destino_nombre"]');
  await inputTrabDestino.click();
  await inputTrabDestino.fill('LUIS');
  // papeletas.component.html:307-316 (<ul class="list-group ..."><li class="list-group-item ..." (click)="selectTrabajadorDestino(t)">)
  const itemTrabDestino = page
    .locator('#papeletaModal input[name="trabajador_destino_nombre"] ~ ul.list-group li.list-group-item')
    .filter({ hasText: 'LUIS PRUEBA DOS' })
    .first();
  await itemTrabDestino.waitFor({ state: 'visible', timeout: 5000 });
  await itemTrabDestino.click();

  // papeletas.component.html:325-329 (<input type="text" ... name="lugar_origen_search" ...>)
  const inputLugarOrigen = page.locator('#papeletaModal input[name="lugar_origen_search"]');
  await inputLugarOrigen.click();
  await inputLugarOrigen.fill('OFICINA');
  // papeletas.component.html:330-341 (<ul class="list-group ..."><li ... class="list-group-item ..." (click)="selectLugarOrigen(lugar)">)
  const itemLugarOrigen = page
    .locator('#papeletaModal input[name="lugar_origen_search"] ~ ul.list-group li.list-group-item')
    .filter({ hasText: 'OFICINA 101' })
    .first();
  await itemLugarOrigen.waitFor({ state: 'visible', timeout: 5000 });
  await itemLugarOrigen.click();

  // papeletas.component.html:346-350 (<input type="text" ... name="lugar_destino_nombre" ...>)
  const inputLugarDestino = page.locator('#papeletaModal input[name="lugar_destino_nombre"]');
  await inputLugarDestino.click();
  await inputLugarDestino.fill('ALMACEN');
  // papeletas.component.html:351-362 (<ul class="list-group ..."><li ... class="list-group-item ..." (click)="selectLugarDestino(lugar)">)
  const itemLugarDestino = page
    .locator('#papeletaModal input[name="lugar_destino_nombre"] ~ ul.list-group li.list-group-item')
    .filter({ hasText: 'ALMACEN CENTRAL' })
    .first();
  await itemLugarDestino.waitFor({ state: 'visible', timeout: 5000 });
  await itemLugarDestino.click();

  if (incluirEquipo) {
    // papeletas.component.html:370-372 (<input type="text" ... name="equipoSearchText" (input)="onSearch(equipoSearchText)" />)
    const inputEquipo = page.locator('#papeletaModal input[name="equipoSearchText"]');
    await inputEquipo.click();
    await inputEquipo.fill('74080003');
    // papeletas.component.html:373-382 (<div class="dropdown-menu show ..."><div ... class="dropdown-item ..." (click)="addEquipo(eq)">)
    const itemEquipo = page
      .locator('#papeletaModal .dropdown-menu.show .dropdown-item')
      .filter({ hasText: '74080003' })
      .first();
    await itemEquipo.waitFor({ state: 'visible', timeout: 5000 });
    await itemEquipo.click();
  }
}

/**
 * Cierra cualquier alerta SweetAlert2 o modal Bootstrap residual para aislar los flujos.
 */
async function limpiarModales(page) {
  try {
    const swalConfirm = page.locator('button.swal2-confirm');
    if (await swalConfirm.isVisible()) {
      await swalConfirm.click();
      await page.waitForTimeout(200);
    }
    // papeletas.component.html:241 (<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar">)
    const modalClose = page.locator('#papeletaModal.show button.btn-close');
    if (await modalClose.isVisible()) {
      await modalClose.click();
      await page.waitForTimeout(300);
    }
  } catch {
    // Ignorar errores de limpieza
  }
}

async function main() {
  const results = [];
  let browser;
  let papeletaCreadaNumero = null;

  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    // Viewport >= 1280px (xl) para que la tabla desktop (papeletas.component.html:54 "hidden xl:block") esté visible
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
        const reason = detail ? ` — ${detail}` : '';
        console.log(`[OK] ${slug}: ${title}${reason}`);
        results.push({ slug, ok: true, detail: detail || 'OK' });
      } catch (err) {
        try {
          await page.screenshot({ path: screenshotPath, fullPage: true });
        } catch {
          // Si la página está cerrada no bloquear el reporte
        }
        console.error(`[FALLO] ${slug}: ${title} — ${err.message}`);
        results.push({ slug, ok: false, detail: err.message });
        await limpiarModales(page);
      }
    }

    // =========================================================================
    // FLUJO 1: Login con credenciales erróneas muestra error; login correcto (admin) llega a /menu-principal/dashboard
    // =========================================================================
    await runFlow(
      'flujo-1-login',
      'Login erróneo muestra error y login admin llega a /menu-principal/dashboard',
      async () => {
        await page.goto(`${UI_URL}/login`, { waitUntil: 'networkidle' });
        await page.evaluate(() => localStorage.clear());
        await page.goto(`${UI_URL}/login`, { waitUntil: 'networkidle' });

        // login.component.html:16-23 (#username), :31-38 (#password), :58-62 (button.login-submit)
        await page.locator('#username').fill(USERS.admin.usuario);
        await page.locator('#password').fill('Clave.Incorrecta.999');
        await page.locator('button.login-submit').click();

        // login.component.html:48-51 (<div *ngIf="errorMessage" class="... bg-red-50 ... text-red-700"><span>{{ errorMessage }}</span></div>)
        const errorBox = page.locator('div.bg-red-50.text-red-700 span');
        await errorBox.waitFor({ state: 'visible', timeout: 5000 });
        const textoError = (await errorBox.innerText()).trim();
        if (!textoError) {
          throw new Error('El cuadro de error de login apareció vacío.');
        }

        // Login correcto con admin_prueba
        await page.locator('#username').fill(USERS.admin.usuario);
        await page.locator('#password').fill(USERS.admin.clave);
        await page.locator('button.login-submit').click();

        await page.waitForURL('**/menu-principal/dashboard', { timeout: 10000 });
        // dashboard.component.html:8 (<h2 ...>Dashboard de Estadísticas</h2>)
        await page.locator('h2:has-text("Dashboard de Estadísticas")').waitFor({
          state: 'visible',
          timeout: 5000,
        });
        // Esperar a que pase el setTimeout(2000) de login.component.ts:50-52
        await page.waitForTimeout(2200);

        return `Mensaje error login: "${textoError}"; URL final: ${page.url()}`;
      }
    );

    // =========================================================================
    // FLUJO 2: Crear papeleta desde /menu-principal/papeletas
    // =========================================================================
    await runFlow(
      'flujo-2-crear-papeleta',
      'Crear papeleta con número provisional readonly y autocompletados',
      async () => {
        if (!page.url().includes('/menu-principal')) {
          await loginViaUI(page, USERS.admin);
        }

        // menu-principal.component.html:50-53 (<a class="nav-link" [routerLink]="['/menu-principal/papeletas']" ...>)
        await page.goto(`${UI_URL}/menu-principal/papeletas`, { waitUntil: 'networkidle' });

        // papeletas.component.html:14-18 (<button ... (click)="openModal(true)">... Nueva Papeleta</button>)
        await page.locator('button:has-text("Nueva Papeleta")').click();

        // papeletas.component.html:233 (<div class="modal fade" id="papeletaModal" ...>)
        const modal = page.locator('#papeletaModal');
        await modal.waitFor({ state: 'visible', timeout: 5000 });

        // papeletas.component.html:249-255 (<input type="text" ... name="numero_papeleta" readonly ...> + <small>Número provisional...</small>)
        const inputNumero = page.locator('#papeletaModal input[name="numero_papeleta"]');
        const isReadonly = await inputNumero.evaluate((el) => el.readOnly === true);
        if (!isReadonly) {
          throw new Error('El campo N° Papeleta (input[name="numero_papeleta"]) no es de solo lectura (readonly).');
        }

        // Esperar a que getUltimoNumeroPapeleta() rellene el valor provisional PA-NNNN (papeletas.component.ts:426-431)
        await page.waitForFunction(
          () => {
            const el = document.querySelector('#papeletaModal input[name="numero_papeleta"]');
            return el && /^PA-\d{4,}$/.test(el.value);
          },
          { timeout: 5000 }
        );
        const numeroProvisional = await inputNumero.inputValue();

        const leyendaProvisional = page.locator('#papeletaModal small:has-text("Número provisional")');
        if (!(await leyendaProvisional.isVisible())) {
          throw new Error('No se muestra la leyenda de número provisional bajo el campo N° Papeleta.');
        }

        await fillCamposBasePapeleta(page, { incluirEquipo: true });

        // papeletas.component.html:409-413 (<button type="button" ... (click)="onSubmit()">... Guardar Papeleta</button>)
        await page.locator('#papeletaModal button:has-text("Guardar Papeleta")').click();

        // papeletas.component.ts:839-849 (Swal.fire toast con customClass.popup = 'es-toast' y título en #swal2-title)
        const toastTitle = page.locator('.swal2-popup.es-toast #swal2-title');
        await toastTitle.waitFor({ state: 'visible', timeout: 5000 });
        const textoExito = (await toastTitle.innerText()).trim();
        const matchNumero = textoExito.match(/PA-\d{4}/);
        if (!matchNumero) {
          throw new Error(`El aviso de éxito no contiene PA-NNNN. Texto recibido: "${textoExito}"`);
        }
        papeletaCreadaNumero = matchNumero[0];

        // papeletas.component.html:55-127 (tabla desktop: <table ...><tbody ...><tr *ngFor="let p of papeletas">)
        const filaNueva = page.locator('table tbody tr').filter({ hasText: papeletaCreadaNumero }).first();
        await filaNueva.waitFor({ state: 'visible', timeout: 5000 });

        return `Provisional="${numeroProvisional}", Definitivo="${papeletaCreadaNumero}", Toast="${textoExito}"`;
      }
    );

    // =========================================================================
    // FLUJO 3: Editar la papeleta creada sin cambiar nada -> aviso de éxito
    // =========================================================================
    await runFlow(
      'flujo-3-editar-sin-cambios',
      'Editar la papeleta creada sin cambiar nada muestra aviso de éxito',
      async () => {
        if (!page.url().includes('/menu-principal/papeletas')) {
          await loginViaUI(page, USERS.admin);
          await page.goto(`${UI_URL}/menu-principal/papeletas`, { waitUntil: 'networkidle' });
        }
        const targetNumero = papeletaCreadaNumero || 'PA-0001';

        // papeletas.component.html:70-125 (fila de la tabla y botón title="Editar" en líneas 109-113)
        const fila = page.locator('table tbody tr').filter({ hasText: targetNumero }).first();
        await fila.waitFor({ state: 'visible', timeout: 5000 });
        await fila.locator('button[title="Editar"]').click();

        // papeletas.component.html:233 (#papeletaModal)
        await page.locator('#papeletaModal.show').waitFor({ state: 'visible', timeout: 5000 });

        // papeletas.component.html:409-413 (botón Guardar Papeleta)
        await page.locator('#papeletaModal button:has-text("Guardar Papeleta")').click();

        // papeletas.component.ts:479 / :839-849 (showSuccessAlert('Papeleta actualizada exitosamente'))
        // Ajuste de Claude tras la 1.ª ejecución: el aviso "creada" del flujo 2 puede seguir
        // visible (dura 2,2 s); se espera específicamente el aviso de actualización.
        const toastTitle = page.locator('.swal2-popup.es-toast #swal2-title', { hasText: /actualizada exitosamente/i });
        try {
          await toastTitle.waitFor({ state: 'visible', timeout: 8000 });
        } catch {
          const visto = await page.locator('#swal2-title').allInnerTexts().catch(() => []);
          throw new Error(`Se esperaba aviso de actualización exitosa; avisos visibles: ${JSON.stringify(visto)}`);
        }
        const textoExito = (await toastTitle.innerText()).trim();

        return `Papeleta ${targetNumero} guardada sin cambios -> "${textoExito}"`;
      }
    );

    // =========================================================================
    // FLUJO 4: Editar cambiando solo la fecha -> tras guardar, la tabla muestra dd/MM/yyyy
    // =========================================================================
    await runFlow(
      'flujo-4-editar-fecha',
      'Editar cambiando solo la fecha actualiza la tabla en formato dd/MM/yyyy',
      async () => {
        if (!page.url().includes('/menu-principal/papeletas')) {
          await loginViaUI(page, USERS.admin);
          await page.goto(`${UI_URL}/menu-principal/papeletas`, { waitUntil: 'networkidle' });
        }
        const targetNumero = papeletaCreadaNumero || 'PA-0001';
        const nuevaFechaISO = '2026-05-15';
        const nuevaFechaTabla = '15/05/2026';

        // Esperar a que desaparezca cualquier toast previo antes de abrir el modal
        await page.waitForTimeout(500);

        // papeletas.component.html:109-113 (<button ... (click)="editPapeleta(p)" title="Editar">)
        const fila = page.locator('table tbody tr').filter({ hasText: targetNumero }).first();
        await fila.waitFor({ state: 'visible', timeout: 5000 });
        await fila.locator('button[title="Editar"]').click();

        await page.locator('#papeletaModal.show').waitFor({ state: 'visible', timeout: 5000 });

        // papeletas.component.html:259-260 (<input type="date" class="form-control rounded-xl" [(ngModel)]="papeleta.fecha" name="fecha" />)
        const inputFecha = page.locator('#papeletaModal input[name="fecha"]');
        await inputFecha.fill(nuevaFechaISO);

        // papeletas.component.html:409-413 (<button ... (click)="onSubmit()">... Guardar Papeleta</button>)
        await page.locator('#papeletaModal button:has-text("Guardar Papeleta")').click();

        const toastTitle = page.locator('.swal2-popup.es-toast #swal2-title');
        await toastTitle.waitFor({ state: 'visible', timeout: 5000 });

        // papeletas.component.html:78 (<td class="px-4 py-3 text-gray-600 whitespace-nowrap">{{ p.fecha | date: 'dd/MM/yyyy' }}</td>)
        const filaActualizada = page
          .locator('table tbody tr')
          .filter({ hasText: targetNumero })
          .filter({ hasText: nuevaFechaTabla })
          .first();
        await filaActualizada.waitFor({ state: 'visible', timeout: 5000 });
        const fechaMostrada = (await filaActualizada.locator('td').nth(1).innerText()).trim();
        if (fechaMostrada !== nuevaFechaTabla) {
          throw new Error(`Fecha en tabla="${fechaMostrada}", se esperaba "${nuevaFechaTabla}".`);
        }

        return `Papeleta ${targetNumero} muestra fecha "${fechaMostrada}"`;
      }
    );

    // =========================================================================
    // FLUJO 5: Validación en interfaz: intentar guardar sin equipos -> aviso de error, sin petición de creación
    // =========================================================================
    await runFlow(
      'flujo-5-validacion-sin-equipos',
      'Intentar guardar sin equipos muestra aviso de error y no crea la papeleta',
      async () => {
        if (!page.url().includes('/menu-principal/papeletas')) {
          await loginViaUI(page, USERS.admin);
          await page.goto(`${UI_URL}/menu-principal/papeletas`, { waitUntil: 'networkidle' });
        }

        await page.waitForTimeout(400);

        let postPapeletasCount = 0;
        let lastPostStatus = null;
        const onRequest = (req) => {
          if (req.method() === 'POST' && req.url().includes('/api/papeletas')) {
            postPapeletasCount++;
          }
        };
        const onResponse = (res) => {
          if (res.request().method() === 'POST' && res.url().includes('/api/papeletas')) {
            lastPostStatus = res.status();
          }
        };
        page.on('request', onRequest);
        page.on('response', onResponse);

        try {
          // papeletas.component.html:14-18 (botón Nueva Papeleta)
          await page.locator('button:has-text("Nueva Papeleta")').click();
          await page.locator('#papeletaModal.show').waitFor({ state: 'visible', timeout: 5000 });

          // Rellenar todos los campos excepto equipos (papeletas.component.html:398-399 "Ningún equipo seleccionado")
          await fillCamposBasePapeleta(page, { incluirEquipo: false });

          // papeletas.component.html:409-413 (botón Guardar Papeleta)
          await page.locator('#papeletaModal button:has-text("Guardar Papeleta")').click();

          // papeletas.component.ts:738-742 / :851-859 (showErrorAlert -> .swal2-popup.es-alert, texto en #swal2-html-container)
          const alertPopup = page.locator('.swal2-popup.es-alert');
          await alertPopup.waitFor({ state: 'visible', timeout: 5000 });
          const textoError = (await page.locator('#swal2-html-container').innerText()).trim();
          if (!/Equipos asociados/i.test(textoError)) {
            throw new Error(`El mensaje de validación no menciona 'Equipos asociados': "${textoError}"`);
          }
          if (postPapeletasCount > 0 && lastPostStatus !== 400) {
            throw new Error(`Se envió POST /api/papeletas con estado inesperado: ${lastPostStatus}`);
          }

          return `Alerta="${textoError}", peticiones POST enviadas=${postPapeletasCount}`;
        } finally {
          page.off('request', onRequest);
          page.off('response', onResponse);
          await limpiarModales(page);
        }
      }
    );

    // =========================================================================
    // FLUJO 6: A8 usuario normal: Eliminar oculto y DELETE directo -> 403
    // =========================================================================
    await runFlow(
      'flujo-6-usuario-eliminar-equipo-403',
      'Usuario normal conserva Editar, no ve Eliminar y DELETE directo responde 403',
      async () => {
        await loginViaUI(page, USERS.user);

        // menu-principal.component.html:38-41 (<a class="nav-link" [routerLink]="['/menu-principal/equipos']" ...>)
        await page.goto(`${UI_URL}/menu-principal/equipos`, { waitUntil: 'networkidle' });

        const botones = page.locator('button[title="Eliminar"]');
        if (await botones.count() !== 0) throw new Error('El usuario normal ve Eliminar.');
        if (await page.locator('button[title="Editar"]').count() === 0) throw new Error('Falta Editar para el usuario normal.');
        const respuesta = await page.evaluate(async (api) => {
          const res = await fetch(`${api}/api/equipos/1`, {
            method: 'DELETE', headers: { Authorization: 'Bearer ' + localStorage.getItem('authToken') }
          });
          return { status: res.status, body: await res.json() };
        }, API_URL);
        if (respuesta.status !== 403) throw new Error('DELETE directo debería responder 403: ' + respuesta.status);
        return 'Eliminar oculto, Editar visible y DELETE directo HTTP 403';
      }
    );

    await limpiarModales(page);

    // =========================================================================
    // FLUJO 7: Generar el PDF de una papeleta -> descarga Papeleta_PA-....pdf y guardarla en capturas/
    // =========================================================================
    await runFlow(
      'flujo-7-descargar-pdf',
      'Generar el PDF de una papeleta dispara descarga Papeleta_PA-....pdf',
      async () => {
        await page.goto(`${UI_URL}/menu-principal/papeletas`, { waitUntil: 'networkidle' });
        const targetNumero = papeletaCreadaNumero || 'PA-0001';

        // papeletas.component.html:119-123 (<button ... (click)="p.id_papeleta ? generarPDF(p.id_papeleta) : null" title="Imprimir PDF">)
        const fila = page.locator('table tbody tr').filter({ hasText: targetNumero }).first();
        await fila.waitFor({ state: 'visible', timeout: 5000 });

        const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
        await fila.locator('button[title="Imprimir PDF"]').click();
        const download = await downloadPromise;

        const suggestedName = download.suggestedFilename();
        if (!/^Papeleta_PA-.*\.pdf$/i.test(suggestedName)) {
          throw new Error(`Nombre de archivo inesperado: "${suggestedName}"`);
        }

        const pdfDestPath = path.join(CAPTURAS_DIR, suggestedName);
        await download.saveAs(pdfDestPath);
        const stats = fs.statSync(pdfDestPath);
        if (stats.size === 0) {
          throw new Error(`El archivo PDF descargado (${suggestedName}) está vacío.`);
        }

        return `Descargado "${suggestedName}" (${stats.size} bytes) en capturas/`;
      }
    );
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  const fallos = results.filter((r) => !r.ok);
  console.log('\n============================================================');
  console.log(`Resumen E2E: ${results.length - fallos.length}/${results.length} flujos en OK`);
  console.log('============================================================');
  if (fallos.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Error fatal ejecutando flujos E2E:', err);
  process.exitCode = 1;
});
