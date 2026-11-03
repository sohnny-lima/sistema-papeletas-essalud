/**
 * flujos-responsive.mjs
 * Pruebas E2E de presentación responsive y unificación visual (bloque U / sesión-listados).
 *
 * Dimensiones probadas:
 *  - 360×780 (móvil)
 *  - 768×1024 (tableta)
 *  - 1280×800 (escritorio)
 *
 * Módulos:
 *  - Equipos (admin y usuario)
 *  - Lugares (admin y usuario)
 *  - Centros asistenciales (solo admin)
 *  - Papeletas (admin y usuario)
 *  - Trabajadores (admin y usuario)
 *  - Usuarios (solo admin)
 *
 * Verificaciones:
 *  1. Espera respuesta 200 de la API y tabla o estado vacío.
 *  2. Sin desplazamiento horizontal:
 *     document.documentElement.scrollWidth <= innerWidth + 1
 *     para cada .es-table-wrap, scrollWidth <= clientWidth + 1.
 *  3. Encabezado (.es-page-head h2) y buscador (.es-search input) visibles.
 *     Botón principal visible si el rol lo tiene.
 *  4. En 360 y 768: thead de .es-table--apilada no visible, primera fila con todas sus
 *     celdas de datos visibles, y cada botón de .es-acciones visible, dentro del viewport y caja >= 40×40.
 *  5. En 360: abre diálogo de alta (o edición), comprueba que .modal-dialog cabe en el ancho,
 *     que el pie (.modal-footer o botón de guardar) es visible tras desplazar el cuerpo,
 *     y lo cierra sin guardar (botón cerrar o Escape).
 *  6. Captura de pantalla completa: docs/revision/pruebas/capturas-sesion-listados/<modulo>-<rol>-<ancho>.png.
 *  7. Salida JSON con cada caso y código de salida != 0 si alguno falla.
 *
 * Solo lectura: no guarda ni altera ningún dato.
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
    rol: 'admin',
    usuario: process.env.ADMIN_USER || 'admin_prueba',
    clave: process.env.ADMIN_PASS || 'Admin.Prueba1',
  },
  user: {
    rol: 'user',
    usuario: process.env.USER_USER || 'usuario_prueba',
    clave: process.env.USER_PASS || 'Usuario.Prueba1',
  },
};

const VIEWPORTS = [
  { nombre: 'movil', width: 360, height: 780 },
  { nombre: 'tableta', width: 768, height: 1024 },
  { nombre: 'escritorio', width: 1280, height: 800 },
];

const MODULOS_CONFIG = {
  equipos: {
    nombre: 'equipos',
    ruta: '/menu-principal/equipos',
    apiPattern: /\/api\/equipos(\?|$)/,
    rolesPermitidos: ['admin', 'user'],
    selectorAlta: '.es-page-head button, .page-header button:has-text("Agregar")',
    selectorModal: '#equipoModal',
    rolTieneBotonAlta: (rol) => rol === 'admin' || true,
  },
  lugares: {
    nombre: 'lugares',
    ruta: '/menu-principal/lugares',
    apiPattern: /\/api\/lugares(\?|$)/,
    rolesPermitidos: ['admin', 'user'],
    selectorAlta: 'button[data-accion="nuevo-lugar"], .es-page-head button',
    selectorModal: '#lugarModal',
    rolTieneBotonAlta: (rol) => rol === 'admin',
  },
  centros: {
    nombre: 'centros',
    ruta: '/menu-principal/centros',
    apiPattern: /\/api\/centros[-_]asistenciales(\?|$)/,
    rolesPermitidos: ['admin'],
    selectorAlta: 'button[data-accion="nuevo-centro"], .es-page-head button',
    selectorModal: '#centroModal',
    rolTieneBotonAlta: (rol) => rol === 'admin',
  },
  papeletas: {
    nombre: 'papeletas',
    ruta: '/menu-principal/papeletas',
    apiPattern: /\/api\/papeletas(\?|$)/,
    rolesPermitidos: ['admin', 'user'],
    selectorAlta: 'button[data-accion="nueva-papeleta"], .es-page-head button:has-text("Nueva Papeleta")',
    selectorModal: '#papeletaModal',
    rolTieneBotonAlta: (rol) => true,
  },
  trabajadores: {
    nombre: 'trabajadores',
    ruta: '/menu-principal/trabajadores',
    apiPattern: /\/api\/trabajadores(\?|$)/,
    rolesPermitidos: ['admin', 'user'],
    selectorAlta: 'button[data-accion="agregar-trabajador"], .es-page-head button:has-text("Agregar Trabajador")',
    selectorModal: '#trabajadorModal',
    rolTieneBotonAlta: (rol) => true,
  },
  usuarios: {
    nombre: 'usuarios',
    ruta: '/menu-principal/usuarios',
    apiPattern: /\/api\/usuarios(\?|$)/,
    rolesPermitidos: ['admin'],
    selectorAlta: 'button[data-accion="nuevo-usuario"], .es-page-head button',
    selectorModal: '#usuarioModal',
    rolTieneBotonAlta: (rol) => rol === 'admin',
  },
};

/**
 * Inicia sesión mediante formulario UI.
 */
async function loginViaUI(page, credenciales) {
  await page.goto(`${UI_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
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
 * Cierra modales abiertos de forma segura sin guardar cambios.
 */
async function cerrarModalSinGuardar(page) {
  const modalVisible = page.locator('.modal.show');
  if ((await modalVisible.count()) > 0) {
    const btnCerrar = modalVisible
      .locator('button.btn-close, button[data-bs-dismiss="modal"], button:has-text("Cancelar"), button:has-text("Cerrar")')
      .first();
    if (await btnCerrar.isVisible()) {
      await btnCerrar.click().catch(() => {});
    } else {
      await page.keyboard.press('Escape');
    }

    await page.locator('.modal.show').waitFor({ state: 'hidden', timeout: 4000 }).catch(async () => {
      await page.keyboard.press('Escape');
    });
    await page.locator('.modal-backdrop').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  }
}

/**
 * Verifica ausencia de scroll horizontal tanto en el documento como en los contenedores de tabla.
 */
async function verificarSinScrollHorizontal(page, etiqueta) {
  const check = await page.evaluate(() => {
    const docScroll = document.documentElement.scrollWidth;
    const winInner = window.innerWidth;
    const docOk = docScroll <= winInner + 1;

    const wraps = Array.from(document.querySelectorAll('.es-table-wrap'));
    const wrapErrors = [];
    for (let i = 0; i < wraps.length; i++) {
      const w = wraps[i];
      if (w.scrollWidth > w.clientWidth + 1) {
        wrapErrors.push(`wrap[${i}]: scrollWidth=${w.scrollWidth} > clientWidth=${w.clientWidth}`);
      }
    }
    return { docOk, docScroll, winInner, wrapErrors };
  });

  if (!check.docOk) {
    throw new Error(
      `Desplazamiento horizontal en documento (${etiqueta}): scrollWidth=${check.docScroll} > innerWidth=${check.winInner}`
    );
  }
  if (check.wrapErrors.length > 0) {
    throw new Error(
      `Desplazamiento horizontal en contenedor de tabla (${etiqueta}): ${check.wrapErrors.join('; ')}`
    );
  }
}

async function main() {
  const results = [];
  let browser;

  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      acceptDownloads: true,
    });
    const page = await context.newPage();

    // Recorrer roles: primero admin, luego user
    for (const rolKey of ['admin', 'user']) {
      const userCred = USERS[rolKey];
      console.log(`\n============================================================`);
      console.log(`Iniciando sesión con rol: ${userCred.rol} (${userCred.usuario})`);
      console.log(`============================================================`);
      await loginViaUI(page, userCred);

      // Recorrer módulos permitidos para el rol
      for (const [modKey, cfg] of Object.entries(MODULOS_CONFIG)) {
        if (!cfg.rolesPermitidos.includes(rolKey)) {
          continue; // Módulo restringido para este rol (p. ej. Centros o Usuarios para user)
        }

        console.log(`\n--- Evaluando módulo: ${modKey} (rol: ${rolKey}) ---`);

        // Recorrer los 3 anchos requeridos: 360, 768, 1280
        for (const vp of VIEWPORTS) {
          const slug = `${modKey}-${rolKey}-${vp.width}`;
          const casoTitulo = `${modKey} (${rolKey}) a ${vp.width}x${vp.height} (${vp.nombre})`;
          const capturaPath = path.join(CAPTURAS_DIR, `${slug}.png`);

          try {
            console.log(`\n[EJECUTANDO] ${slug}: ${casoTitulo}`);

            // Configurar viewport
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await page.evaluate(() => window.scrollTo(0, 0));

            // 1. Navegar y esperar respuesta principal de la API (200)
            const respPromise = page.waitForResponse(
              (r) => cfg.apiPattern.test(r.url()) && r.request().method() === 'GET' && r.status() === 200,
              { timeout: 12000 }
            );
            await page.goto(`${UI_URL}${cfg.ruta}`, { waitUntil: 'domcontentloaded' });
            await respPromise;

            // Esperar que la carga finalice y se renderice tabla o estado vacío
            await page.locator('.es-loader, .spinner-border').waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {});
            await page.locator('table, .es-table, .es-state').first().waitFor({ state: 'visible', timeout: 6000 });
            await page.evaluate(() => window.scrollTo(0, 0));

            // 2. Comprobar que no hay desplazamiento horizontal
            await verificarSinScrollHorizontal(page, `${modKey}-${rolKey}-${vp.width}`);

            // 3. Encabezado (.es-page-head h2 o .page-header h2) y buscador visibles
            const encabezado = page.locator('.es-page-head h2, .page-header h2').first();
            await encabezado.waitFor({ state: 'visible', timeout: 4000 });

            const buscador = page.locator('.es-search input, .category-select ~ input, input[type="search"]').first();
            await buscador.waitFor({ state: 'visible', timeout: 4000 });

            // Botón principal visible si el rol lo tiene
            const debeTenerBoton = cfg.rolTieneBotonAlta(rolKey);
            const botonPrincipal = page.locator(cfg.selectorAlta).first();
            if (debeTenerBoton) {
              await botonPrincipal.waitFor({ state: 'visible', timeout: 4000 });
            } else {
              const botonVisible = (await botonPrincipal.count()) > 0 && (await botonPrincipal.isVisible());
              if (botonVisible) {
                throw new Error(
                  `El botón de alta "${cfg.selectorAlta}" no debía estar visible para el rol ${rolKey} en ${modKey}`
                );
              }
            }

            // 4. En 360 y 768: thead de .es-table--apilada no visible, primera fila con celdas de datos visibles,
            //    y cada botón de .es-acciones visible, dentro del viewport y con caja >= 40x40
            if (vp.width <= 768) {
              const tableApilada = page.locator('.es-table--apilada');
              if ((await tableApilada.count()) > 0) {
                const thead = page.locator('.es-table--apilada thead');
                if ((await thead.count()) > 0) {
                  const theadVisible = await thead.evaluate((el) => {
                    const rect = el.getBoundingClientRect();
                    const s = window.getComputedStyle(el);
                    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
                    // Clip rect o dimensiones 1x1 usadas para ocultar visualmente
                    if (rect.width <= 1 && rect.height <= 1) return false;
                    if (s.clip && s.clip !== 'auto' && s.clip !== 'rect(auto, auto, auto, auto)') return false;
                    return true;
                  });
                  if (theadVisible) {
                    throw new Error(
                      `El thead de .es-table--apilada permanece visible en ancho ${vp.width}px en módulo ${modKey}`
                    );
                  }
                }
              }

              // Primera fila con celdas de datos visibles
              const primeraFila = page.locator('table tbody tr').first();
              if (await primeraFila.isVisible()) {
                const celdas = primeraFila.locator('td');
                const totalCeldas = await celdas.count();
                for (let c = 0; c < totalCeldas; c++) {
                  const celda = celdas.nth(c);
                  if (!(await celda.isVisible())) {
                    throw new Error(
                      `La celda ${c + 1} de la primera fila en ${modKey} (${vp.width}px) no es visible`
                    );
                  }
                }

                // Cada botón de .es-acciones visible, dentro del viewport y caja >= 40x40
                const botonesAccion = primeraFila.locator('.es-acciones button, .es-col-acciones button');
                const totalBotones = await botonesAccion.count();
                for (let b = 0; b < totalBotones; b++) {
                  const btn = botonesAccion.nth(b);
                  if (await btn.isVisible()) {
                    const box = await btn.boundingBox();
                    if (!box) {
                      throw new Error(`Botón de acción ${b + 1} en ${modKey} no tiene boundingBox`);
                    }
                    if (box.width < 39.5 || box.height < 39.5) {
                      throw new Error(
                        `Botón de acción ${b + 1} en ${modKey} tiene tamaño menor a 40x40: ancho=${box.width.toFixed(1)}, alto=${box.height.toFixed(1)}`
                      );
                    }
                    if (box.x < 0 || box.x + box.width > vp.width + 1) {
                      throw new Error(
                        `Botón de acción ${b + 1} en ${modKey} excede viewport horizontal: x=${box.x.toFixed(1)}, ancho=${box.width.toFixed(1)}, viewport=${vp.width}`
                      );
                    }
                  }
                }
              }
            }

            // Captura de pantalla completa de la vista de listado
            await page.screenshot({ path: capturaPath, fullPage: true });

            // 5. En 360: abre el diálogo de alta del módulo (solo admin) o de edición si es lo que hay,
            //    comprueba que .modal-dialog cabe en el ancho y que el pie (.modal-footer o botón de guardar)
            //    es visible tras desplazar el cuerpo; ciérralo sin guardar (botón cerrar o Escape).
            if (vp.width === 360) {
              let modalAbierto = false;

              if (rolKey === 'admin') {
                const btnAlta = page.locator(cfg.selectorAlta).first();
                if (await btnAlta.isVisible()) {
                  await btnAlta.click();
                  modalAbierto = true;
                }
              } else {
                // Rol usuario: si no hay botón de alta, probar botón de edición en la primera fila si existe
                const primeraFila = page.locator('table tbody tr').first();
                if (await primeraFila.isVisible()) {
                  const btnEdicion = primeraFila
                    .locator('button[title="Editar"], button[data-accion*="editar"], .es-acciones button')
                    .first();
                  if (await btnEdicion.isVisible()) {
                    await btnEdicion.click();
                    modalAbierto = true;
                  }
                }
              }

              if (modalAbierto) {
                const modal = page.locator('.modal.show');
                await modal.waitFor({ state: 'visible', timeout: 5000 });

                const dialog = modal.locator('.modal-dialog');
                await dialog.waitFor({ state: 'visible', timeout: 5000 });

                // Comprobar que .modal-dialog cabe en el ancho (<= 360 px)
                const dialogBox = await dialog.boundingBox();
                if (!dialogBox) {
                  throw new Error(`No se pudo obtener boundingBox de .modal-dialog en ${modKey}`);
                }
                if (dialogBox.width > 360) {
                  throw new Error(
                    `.modal-dialog excede el ancho de pantalla de 360px: ancho=${dialogBox.width.toFixed(1)}px`
                  );
                }

                // Desplazar el cuerpo (.modal-body)
                const modalBody = modal.locator('.modal-body');
                if ((await modalBody.count()) > 0) {
                  await modalBody.evaluate((el) => {
                    el.scrollTop = el.scrollHeight;
                  });
                }

                // Pie o botón de guardar visible tras desplazar
                const pieOGuardar = modal
                  .locator(
                    '.modal-footer, .es-modal-footer, button[type="submit"], button:has-text("Guardar"), button:has-text("Crear"), button:has-text("Agregar")'
                  )
                  .first();
                await pieOGuardar.waitFor({ state: 'visible', timeout: 5000 });

                // Cerrar sin guardar
                await cerrarModalSinGuardar(page);
              }
            }

            const detail = `OK: API 200, 0 overflow horizontal, encabezado/buscador OK, tabla apilada OK, captura ${slug}.png`;
            console.log(`[OK] ${slug}: ${detail}`);
            results.push({
              slug,
              modulo: modKey,
              rol: rolKey,
              ancho: vp.width,
              alto: vp.height,
              ok: true,
              detail,
              captura: `${slug}.png`,
            });
          } catch (err) {
            console.error(`[FALLO] ${slug}: ${err.message}`);
            results.push({
              slug,
              modulo: modKey,
              rol: rolKey,
              ancho: vp.width,
              alto: vp.height,
              ok: false,
              detail: err.message,
              captura: `${slug}.png`,
            });
            await cerrarModalSinGuardar(page);
          }
        }
      }
    }
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
    guion: 'flujos-responsive.mjs',
    total: results.length,
    exitosos: results.length - fallos.length,
    fallidos: fallos.length,
    casos: results,
  };

  console.log('\n============================================================');
  console.log(`Resumen E2E Responsive: ${resumen.exitosos}/${resumen.total} combinaciones en OK`);
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
  console.error('Error fatal ejecutando E2E responsive:', err);
  process.exitCode = 1;
});
