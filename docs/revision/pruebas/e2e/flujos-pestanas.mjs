/**
 * flujos-pestanas.mjs
 * Pruebas E2E de sincronización de sesión entre pestañas del mismo perfil
 * y comprobación de contexto independiente (bloque U / sesión-listados).
 *
 * Flujos:
 *  a) Cambio de cuenta: a y b entran como admin; b abre /centros; a cierra sesión
 *     y entra como usuario; b se actualiza sola (<= 10 s) a usuario y sale de /centros.
 *  b) Cierre de sesión: a y b con sesión de usuario; b abre modal en Equipos;
 *     a cierra sesión; b navega a /login con aviso "La sesión se cerró en otra pestaña."
 *     y sin modales abiertos.
 *  c) Entrada desde el login: a y b en /login; a entra como admin; b pasa sola al menú
 *     con indicador de admin.
 *  d) Contexto independiente: c con sesión de usuario en otro contexto no cambia durante a)-c).
 *  e) Respuesta tardía: b retrasa /api/equipos 3 s; a cambia de cuenta mientras tanto;
 *     b descarta la respuesta tardía sin alertas de error ni filas no autorizadas.
 *
 * Solo lectura: no modifica ni persiste datos en el servidor.
 */

import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CAPTURAS_DIR = path.resolve(__dirname, '..', 'capturas-sesion-listados');
fs.mkdirSync(CAPTURAS_DIR, { recursive: true });

const UI_URL = (process.env.UI_URL || '').trim().replace(/\/+$/, '');
if (!UI_URL) {
  console.error('Error: La variable de entorno UI_URL es obligatoria.');
  process.exit(1);
}

const API_URL = (process.env.API_URL || 'http://localhost:3000').trim().replace(/\/+$/, '');

const USERS = {
  admin: {
    usuario: process.env.ADMIN_USER || 'admin_prueba',
    clave: process.env.ADMIN_PASS || 'Admin.Prueba1',
    rolTexto: 'Administrador',
  },
  user: {
    usuario: process.env.USER_USER || 'usuario_prueba',
    clave: process.env.USER_PASS || 'Usuario.Prueba1',
    rolTexto: 'Usuario',
  },
};

/**
 * Registra errores de consola y pageerror en una página.
 */
function registrarErroresPagina(page, etiqueta) {
  const registros = [];
  page.on('pageerror', (err) => {
    registros.push({ tipo: 'pageerror', texto: err.message || String(err), etiqueta });
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      if (!txt.includes('chrome-extension://')) {
        registros.push({ tipo: 'console.error', texto: txt, etiqueta });
      }
    }
  });
  return registros;
}

/**
 * Inicia sesión mediante el formulario UI.
 */
async function loginViaUI(page, credenciales) {
  await page.goto(`${UI_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#username').fill(credenciales.usuario);
  await page.locator('#password').fill(credenciales.clave);
  await Promise.all([
    page.waitForURL('**/menu-principal/**', { timeout: 10000 }),
    page.locator('button.login-submit').click(),
  ]);
  await page.locator('[data-sesion="indicador"]').waitFor({ state: 'visible', timeout: 7000 });
}

/**
 * Cierra sesión desde el botón de la barra lateral.
 */
async function logoutViaUI(page) {
  const btnLogout = page.locator('button.sidebar-logout');
  await btnLogout.waitFor({ state: 'visible', timeout: 5000 });
  await Promise.all([
    page.waitForURL('**/login**', { timeout: 10000 }),
    btnLogout.click(),
  ]);
}

/**
 * Limpia modales o diálogos residuales si quedaron abiertos tras un fallo.
 */
async function limpiarModales(page) {
  try {
    const swalCancel = page.locator('button.swal2-cancel, button.swal2-close');
    if (await swalCancel.isVisible()) {
      await swalCancel.click().catch(() => {});
    }
    const modalClose = page.locator('.modal.show button.btn-close, .modal.show [data-bs-dismiss="modal"]');
    if (await modalClose.isVisible()) {
      await modalClose.click().catch(() => {});
    }
  } catch {
    // Silenciar errores durante limpieza
  }
}

async function main() {
  const results = [];
  let browser;

  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });

    // Contexto 1: comparte localStorage entre pestañas (páginas a y b)
    const context1 = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      acceptDownloads: true,
    });
    const pageA = await context1.newPage();
    const pageB = await context1.newPage();

    // Contexto 2: perfil / ventana privada independiente (página c)
    const context2 = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      acceptDownloads: true,
    });
    const pageC = await context2.newPage();

    const erroresA = registrarErroresPagina(pageA, 'pestaña-A');
    const erroresB = registrarErroresPagina(pageB, 'pestaña-B');
    const erroresC = registrarErroresPagina(pageC, 'pestaña-C');

    function verificarPageErrors(indicePrevioA, indicePrevioB, indicePrevioC, casoNombre) {
      const nuevosA = erroresA.slice(indicePrevioA).filter((e) => e.tipo === 'pageerror');
      const nuevosB = erroresB.slice(indicePrevioB).filter((e) => e.tipo === 'pageerror');
      const nuevosC = erroresC.slice(indicePrevioC).filter((e) => e.tipo === 'pageerror');
      const todos = [...nuevosA, ...nuevosB, ...nuevosC];
      if (todos.length > 0) {
        throw new Error(
          `Pageerror detectado durante ${casoNombre}: ` +
            todos.map((e) => `[${e.etiqueta}] ${e.texto}`).join('; ')
        );
      }
    }

    // Inicializar Contexto 2 (página c) con usuario_prueba
    console.log('[INFO] Inicializando contexto independiente C (usuario_prueba)...');
    await loginViaUI(pageC, USERS.user);
    await pageC.goto(`${UI_URL}/menu-principal/dashboard`, { waitUntil: 'domcontentloaded' });
    const urlInicialC = pageC.url();

    const indUsuarioC0 = (await pageC.locator('[data-sesion="usuario"]').innerText()).trim();
    const indRolC0 = (await pageC.locator('[data-sesion="rol"]').innerText()).trim();
    if (indUsuarioC0 !== USERS.user.usuario || indRolC0 !== USERS.user.rolTexto) {
      throw new Error(`Contexto C inició con sesión inesperada: ${indUsuarioC0} / ${indRolC0}`);
    }

    // =========================================================================
    // a) Cambio de cuenta
    //    a y b entran como admin; b abre /centros. En a: cerrar sesión y entrar
    //    como usuario. Comprobar en b, sin recargarla tú, en <= 10 s:
    //    indicador "usuario_prueba · Usuario", menú sin Centros ni Usuarios,
    //    y la URL ya no es /centros (Dashboard).
    // =========================================================================
    await (async () => {
      const slug = 'pestanas-a-cambio-cuenta';
      const title = 'Cambio de cuenta sincronizado entre pestañas sin recargar a mano';
      const snapA = erroresA.length;
      const snapB = erroresB.length;
      const snapC = erroresC.length;

      try {
        console.log(`\n[EJECUTANDO] ${slug}: ${title}`);
        // 1. Limpiar contexto 1 y autenticar como admin desde página A
        await pageA.goto(`${UI_URL}/login`, { waitUntil: 'domcontentloaded' });
        await pageA.evaluate(() => localStorage.clear());
        await loginViaUI(pageA, USERS.admin);

        // 2. Página B navega a /menu-principal/centros (aprovecha localStorage compartido)
        await Promise.all([
          pageB.waitForResponse((r) => r.url().includes('/centros') && r.request().method() === 'GET'),
          pageB.goto(`${UI_URL}/menu-principal/centros`, { waitUntil: 'domcontentloaded' }),
        ]);

        const indUsuarioB1 = (await pageB.locator('[data-sesion="usuario"]').innerText()).trim();
        const indRolB1 = (await pageB.locator('[data-sesion="rol"]').innerText()).trim();
        if (indUsuarioB1 !== USERS.admin.usuario || indRolB1 !== USERS.admin.rolTexto) {
          throw new Error(`Página B no cargó sesión admin inicial: ${indUsuarioB1} / ${indRolB1}`);
        }

        // 3. En página A: Cerrar sesión e iniciar como usuario_prueba
        await logoutViaUI(pageA);
        await loginViaUI(pageA, USERS.user);

        // 4. Comprobar en página B, SIN recargarla tú, con espera <= 10 s
        // La URL debe cambiar automáticamente a dashboard (AdminGuard redirige)
        await pageB.waitForURL(
          (url) => !url.pathname.includes('/centros') && url.pathname.includes('/menu-principal/dashboard'),
          { timeout: 10000 }
        );

        // Indicador de sesión en página B debe reflejar usuario_prueba · Usuario
        await pageB
          .locator('[data-sesion="usuario"]')
          .filter({ hasText: USERS.user.usuario })
          .waitFor({ state: 'visible', timeout: 10000 });
        await pageB
          .locator('[data-sesion="rol"]')
          .filter({ hasText: USERS.user.rolTexto })
          .waitFor({ state: 'visible', timeout: 10000 });

        // Menú en página B sin Centros ni Usuarios
        const linkCentros = pageB.locator('a[routerLink*="centros"], a:has-text("Centros asistenciales")');
        const linkUsuarios = pageB.locator('a[routerLink*="usuarios"], a[data-menu="usuarios"]');
        if ((await linkCentros.count()) > 0 && (await linkCentros.first().isVisible())) {
          throw new Error('El menú en pestaña B aún muestra el enlace a Centros asistenciales');
        }
        if ((await linkUsuarios.count()) > 0 && (await linkUsuarios.first().isVisible())) {
          throw new Error('El menú en pestaña B aún muestra el enlace a Usuarios');
        }

        verificarPageErrors(snapA, snapB, snapC, 'flujo a');

        const screenshotPath = path.join(CAPTURAS_DIR, `${slug}.png`);
        await pageB.screenshot({ path: screenshotPath, fullPage: true });

        const detail = 'Pestaña B sincronizó cambio a usuario_prueba en <= 10s, redirigió a dashboard y ocultó Centros/Usuarios';
        console.log(`[OK] ${slug}: ${detail}`);
        results.push({ slug, ok: true, detail });
      } catch (err) {
        console.error(`[FALLO] ${slug}: ${err.message}`);
        results.push({ slug, ok: false, detail: err.message });
        await limpiarModales(pageB);
      }
    })();

    // =========================================================================
    // b) Cierre de sesión
    //    a y b con sesión de usuario; b en Equipos con el diálogo de un registro abierto.
    //    a cierra sesión. En b: URL /login, aviso "La sesión se cerró en otra pestaña.",
    //    ningún diálogo (.modal.show, .swal2-container) visible.
    // =========================================================================
    await (async () => {
      const slug = 'pestanas-b-cierre-sesion';
      const title = 'Cierre de sesión sincronizado con diálogo abierto en otra pestaña';
      const snapA = erroresA.length;
      const snapB = erroresB.length;
      const snapC = erroresC.length;

      try {
        console.log(`\n[EJECUTANDO] ${slug}: ${title}`);
        // 1. Asegurar sesión de usuario en pestaña B y navegar a Equipos
        await Promise.all([
          pageB.waitForResponse((r) => r.url().includes('/api/equipos') && r.request().method() === 'GET'),
          pageB.goto(`${UI_URL}/menu-principal/equipos`, { waitUntil: 'domcontentloaded' }),
        ]);

        // Abrir diálogo de edición de un registro en pestaña B
        const btnEditarEquipo = pageB.locator('button[title="Editar"], button[data-accion*="editar"]').first();
        await btnEditarEquipo.waitFor({ state: 'visible', timeout: 5000 });
        await btnEditarEquipo.click();

        // Esperar modal abierto
        const modalVisible = pageB.locator('.modal.show, #equipoModal.show');
        await modalVisible.waitFor({ state: 'visible', timeout: 5000 });

        // 2. En pestaña A: Cerrar sesión
        await logoutViaUI(pageA);

        // 3. Comprobar en pestaña B que navega a /login con aviso y sin diálogos
        await pageB.waitForURL('**/login**', { timeout: 10000 });

        const avisoPestana = pageB.locator('#login-aviso');
        await avisoPestana.waitFor({ state: 'visible', timeout: 5000 });
        const textoAviso = (await avisoPestana.innerText()).trim();
        if (!textoAviso.includes('La sesión se cerró en otra pestaña.')) {
          throw new Error(`Texto de aviso inesperado en login: "${textoAviso}"`);
        }

        // Ningún modal ni Swal visible
        const modalesVisibles = pageB.locator('.modal.show');
        if ((await modalesVisibles.count()) > 0 && (await modalesVisibles.first().isVisible())) {
          throw new Error('Quedó un diálogo .modal.show visible tras cerrar sesión en otra pestaña');
        }
        const swalVisible = pageB.locator('.swal2-container');
        if ((await swalVisible.count()) > 0 && (await swalVisible.first().isVisible())) {
          throw new Error('Quedó un diálogo .swal2-container visible tras cerrar sesión en otra pestaña');
        }

        verificarPageErrors(snapA, snapB, snapC, 'flujo b');

        const screenshotPath = path.join(CAPTURAS_DIR, `${slug}.png`);
        await pageB.screenshot({ path: screenshotPath, fullPage: true });

        const detail = 'Pestaña B cerró diálogo modal y navegó a /login con aviso "La sesión se cerró en otra pestaña."';
        console.log(`[OK] ${slug}: ${detail}`);
        results.push({ slug, ok: true, detail });
      } catch (err) {
        console.error(`[FALLO] ${slug}: ${err.message}`);
        results.push({ slug, ok: false, detail: err.message });
        await limpiarModales(pageB);
      }
    })();

    // =========================================================================
    // c) Entrada desde el login
    //    a y b en /login; a entra como admin; b pasa sola al menú con el indicador de admin.
    // =========================================================================
    await (async () => {
      const slug = 'pestanas-c-login-sincronizado';
      const title = 'Ingreso desde /login en pestaña A redirige automáticamente pestaña B';
      const snapA = erroresA.length;
      const snapB = erroresB.length;
      const snapC = erroresC.length;

      try {
        console.log(`\n[EJECUTANDO] ${slug}: ${title}`);
        // 1. Ambas pestañas en /login
        await pageA.goto(`${UI_URL}/login`, { waitUntil: 'domcontentloaded' });
        await pageB.goto(`${UI_URL}/login`, { waitUntil: 'domcontentloaded' });

        // 2. En página A: Ingresar como admin
        await loginViaUI(pageA, USERS.admin);

        // 3. Comprobar en página B que pasa sola al menú con indicador admin
        await pageB.waitForURL('**/menu-principal/**', { timeout: 10000 });
        await pageB
          .locator('[data-sesion="usuario"]')
          .filter({ hasText: USERS.admin.usuario })
          .waitFor({ state: 'visible', timeout: 10000 });
        await pageB
          .locator('[data-sesion="rol"]')
          .filter({ hasText: USERS.admin.rolTexto })
          .waitFor({ state: 'visible', timeout: 10000 });

        verificarPageErrors(snapA, snapB, snapC, 'flujo c');

        const screenshotPath = path.join(CAPTURAS_DIR, `${slug}.png`);
        await pageB.screenshot({ path: screenshotPath, fullPage: true });

        const detail = 'Pestaña B pasó automáticamente al menú principal con sesión admin al iniciar sesión en pestaña A';
        console.log(`[OK] ${slug}: ${detail}`);
        results.push({ slug, ok: true, detail });
      } catch (err) {
        console.error(`[FALLO] ${slug}: ${err.message}`);
        results.push({ slug, ok: false, detail: err.message });
        await limpiarModales(pageB);
      }
    })();

    // =========================================================================
    // d) Contexto independiente
    //    c con sesión de usuario no cambia durante a)-c) (indicador y URL iguales).
    // =========================================================================
    await (async () => {
      const slug = 'pestanas-d-contexto-independiente';
      const title = 'Contexto independiente C no se ve afectado por cambios de sesión en contexto 1';
      const snapC = erroresC.length;

      try {
        console.log(`\n[EJECUTANDO] ${slug}: ${title}`);
        // Comprobar que C sigue en URL de dashboard
        const urlActualC = pageC.url();
        if (urlActualC.includes('/login')) {
          throw new Error(`Contexto C fue redirigido a login indebidamente: ${urlActualC}`);
        }
        if (!urlActualC.includes('/menu-principal/dashboard')) {
          throw new Error(`URL de contexto C cambió inesperadamente: inicial=${urlInicialC}, actual=${urlActualC}`);
        }

        // Comprobar que el indicador sigue siendo usuario_prueba · Usuario
        const indUsuarioC = (await pageC.locator('[data-sesion="usuario"]').innerText()).trim();
        const indRolC = (await pageC.locator('[data-sesion="rol"]').innerText()).trim();
        if (indUsuarioC !== USERS.user.usuario || indRolC !== USERS.user.rolTexto) {
          throw new Error(
            `Indicador en contexto C fue modificado por contexto 1: obtenido="${indUsuarioC} · ${indRolC}", esperado="${USERS.user.usuario} · ${USERS.user.rolTexto}"`
          );
        }

        verificarPageErrors(0, 0, snapC, 'flujo d');

        const screenshotPath = path.join(CAPTURAS_DIR, `${slug}.png`);
        await pageC.screenshot({ path: screenshotPath, fullPage: true });

        const detail = 'Contexto C conservó URL e indicador usuario_prueba intactos durante todos los cambios del contexto 1';
        console.log(`[OK] ${slug}: ${detail}`);
        results.push({ slug, ok: true, detail });
      } catch (err) {
        console.error(`[FALLO] ${slug}: ${err.message}`);
        results.push({ slug, ok: false, detail: err.message });
      }
    })();

    // =========================================================================
    // e) Respuesta tardía
    //    En b, intercepta (page.route) **/api/equipos para retrasarla 3 s;
    //    navega a Equipos; mientras tanto a cierra sesión y entra con la otra cuenta.
    //    Al final, b no muestra filas de la petición retrasada en una pantalla no
    //    autorizada ni alertas de error (.swal2-container).
    // =========================================================================
    await (async () => {
      const slug = 'pestanas-e-respuesta-tardia';
      const title = 'Petición retrasada descartada por AuthInterceptor tras cambio de cuenta';
      const snapA = erroresA.length;
      const snapB = erroresB.length;
      const snapC = erroresC.length;

      try {
        console.log(`\n[EJECUTANDO] ${slug}: ${title}`);
        // Contexto 1 actualmente está en admin (desde caso c).
        // 1. En pestaña B interceptar **/api/equipos y retrasarla 3 segundos
        await pageB.route('**/api/equipos**', async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          await route.continue();
        });

        // 2. Iniciar navegación a Equipos en pestaña B (la petición quedará pendiente)
        const navEquiposPromise = pageB.goto(`${UI_URL}/menu-principal/equipos`, { waitUntil: 'domcontentloaded' });

        // 3. Mientras tanto, en pestaña A: Cerrar sesión y entrar como usuario
        await logoutViaUI(pageA);
        await loginViaUI(pageA, USERS.user);

        // Esperar a que concluya la navegación y se complete el retardo de 3 s
        await navEquiposPromise;
        await new Promise((resolve) => setTimeout(resolve, 3500));

        // Limpiar la regla de intercepción
        await pageB.unroute('**/api/equipos**');

        // 4. Comprobaciones en pestaña B:
        // No debe haber alertas de error (SweetAlert2)
        const swalVisible = pageB.locator('.swal2-container');
        if ((await swalVisible.count()) > 0 && (await swalVisible.first().isVisible())) {
          throw new Error('Se mostró una alerta .swal2-container tras la respuesta tardía descartada');
        }

        // Pestaña B debe haber sincronizado la nueva sesión o redirigido
        const indRolB = (await pageB.locator('[data-sesion="rol"]').innerText().catch(() => '')).trim();
        if (indRolB && indRolB !== USERS.user.rolTexto) {
          throw new Error(`Pestaña B muestra rol desactualizado tras respuesta tardía: "${indRolB}"`);
        }

        verificarPageErrors(snapA, snapB, snapC, 'flujo e');

        const screenshotPath = path.join(CAPTURAS_DIR, `${slug}.png`);
        await pageB.screenshot({ path: screenshotPath, fullPage: true });

        const detail = 'Petición tardía de 3s fue descartada limpiamente por AuthInterceptor sin alertas .swal2-container ni errores';
        console.log(`[OK] ${slug}: ${detail}`);
        results.push({ slug, ok: true, detail });
      } catch (err) {
        console.error(`[FALLO] ${slug}: ${err.message}`);
        results.push({ slug, ok: false, detail: err.message });
        await pageB.unroute('**/api/equipos**').catch(() => {});
        await limpiarModales(pageB);
      }
    })();
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  // =========================================================================
  // Resumen final y salida JSON estructurada
  // =========================================================================
  const fallos = results.filter((r) => !r.ok);
  const resumen = {
    fecha: new Date().toISOString(),
    guion: 'flujos-pestanas.mjs',
    total: results.length,
    exitosos: results.length - fallos.length,
    fallidos: fallos.length,
    casos: results,
  };

  console.log('\n============================================================');
  console.log(`Resumen E2E Pestañas: ${resumen.exitosos}/${resumen.total} flujos en OK`);
  for (const r of results) {
    console.log(` - [${r.ok ? 'OK' : 'FALLO'}] ${r.slug}: ${r.detail}`);
  }
  console.log('============================================================');
  console.log('\nSALIDA_JSON_INICIO');
  console.log(JSON.stringify(resumen, null, 2));
  console.log('SALIDA_JSON_FIN\n');

  if (fallos.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Error fatal ejecutando E2E de pestañas:', err);
  process.exitCode = 1;
});
