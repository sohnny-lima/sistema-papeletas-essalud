// docs/revision/pruebas/e2e/flujos-vm1-docker.mjs
// E2E para validación en Docker (:8080) bajo VM1:
// Fases: normal (navegación e inactividad), sesion (guardar estado),
//        caida (verificar 503 < 15s desde 'request' y SweetAlert2) y recuperacion (200 con sesión guardada).
// Incorpora correcciones por revisión r003 (Codex): r003-1, r003-2, r003-3 y r003-4.

import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Configuración por variables de entorno
const UI_URL = (process.env.UI_URL || 'http://localhost:8080').replace(/\/+$/, '');
const ROL_ENV = (process.env.ROL || 'ambos').toLowerCase().trim();

// r003-3: El pool de pg cierra conexiones inactivas a los 10 s (idleTimeoutMillis: 10000).
// Por defecto se fijan 15 s (> 10 s) para validar reapertura sin esperas excesivas en CI/local.
// Para reproducir con fidelidad histórica el incidente de VM1 tras inactividad prolongada, se recomienda 450 s.
const INACTIVIDAD_S = process.env.INACTIVIDAD_S !== undefined
  ? Math.max(0, parseInt(process.env.INACTIVIDAD_S, 10) || 0)
  : 15;

const FASE = (process.env.FASE || 'normal').toLowerCase().trim();
const ESTADO_DIR = process.env.ESTADO_DIR || path.resolve(process.cwd(), '.local/estado-e2e');

// Credenciales estándar de demostración / revisión
const USUARIOS = {
  admin: {
    usuario: 'admin_prueba',
    clave: 'Admin.Prueba1',
    rolNombre: 'Administrador',
    esAdmin: true,
  },
  usuario: {
    usuario: 'usuario_prueba',
    clave: 'Usuario.Prueba1',
    rolNombre: 'Usuario',
    esAdmin: false,
  },
};

const MODULOS_ADMIN = [
  'dashboard',
  'equipos',
  'lugares',
  'centros',
  'papeletas',
  'trabajadores',
  'usuarios',
];

const MODULOS_USUARIO = [
  'dashboard',
  'equipos',
  'lugares',
  'papeletas',
  'trabajadores',
];

// r003-1: Configuración de API principal y selector de pantalla cargada por módulo
const CONFIG_MODULOS = {
  dashboard: {
    apiPattern: '/api/estadisticas',
    selectorCarga: 'app-dashboard .stat-card, .stat-card',
    nombre: 'Dashboard',
  },
  equipos: {
    apiPattern: '/api/equipos',
    selectorCarga: 'app-equipos table.es-table tbody tr, table.es-table tbody tr',
    nombre: 'Equipos',
  },
  lugares: {
    apiPattern: '/api/lugares',
    selectorCarga: 'app-lugares table.es-table tbody tr, table.es-table tbody tr',
    nombre: 'Lugares',
  },
  centros: {
    apiPattern: '/api/centros_asistenciales',
    selectorCarga: 'app-centros table.es-table tbody tr, table.es-table tbody tr',
    nombre: 'Centros',
  },
  papeletas: {
    apiPattern: '/api/papeletas',
    selectorCarga: 'app-papeletas table.es-papeletas-table tbody tr, table.es-papeletas-table tbody tr',
    nombre: 'Papeletas',
  },
  trabajadores: {
    apiPattern: '/api/trabajadores',
    selectorCarga: 'app-trabajadores table.es-table tbody tr, table.es-table tbody tr',
    nombre: 'Trabajadores',
  },
  usuarios: {
    apiPattern: '/api/usuarios',
    selectorCarga: 'app-usuarios table.es-table tbody tr, table.es-table tbody tr',
    nombre: 'Usuarios',
  },
};

// Estructuras de salida acumuladas
const registroPeticiones = [];
const erroresConsola = [];
const erroresConsolaInesperados = [];
const erroresPageError = [];
const peticionesFallidas = [];
const cancelaciones = []; // r004-2: cancelaciones del propio navegador (no son fallo)
// r005-2 (Claude): ERR_ABORTED solo se admite durante una transición o limpieza deliberada del guion.
let transicionesEnCurso = 0;
async function enTransicion(accion) {
  transicionesEnCurso++;
  try { return await accion(); } finally { transicionesEnCurso--; }
}
let respuestas5xxInesperadas = 0;

const resultadoFinal = {
  ok: true,
  fase: FASE,
  rolesSolicitados: ROL_ENV,
  rolesEjecutados: [],
  uiUrl: UI_URL,
  inactividadS: INACTIVIDAD_S,
  fecha: new Date().toISOString(),
  respuestas5xxInesperadas: 0,
  totalPeticionesApi: 0,
  motivoFallo: null,
  resumen: '',
  resultadosPorRol: {},
  erroresConsola: [],
  erroresConsolaInesperados: [],
  erroresPageError: [],
  peticionesFallidas: [],
  registroPeticiones: [],
};

// Determinar lista de roles a procesar
function resolverRoles(rolParam) {
  if (rolParam === 'admin') return ['admin'];
  if (rolParam === 'usuario') return ['usuario'];
  if (rolParam === 'ambos') return ['admin', 'usuario'];
  throw new Error(`ROL "${rolParam}" no válido. Opciones permitidas: admin | usuario | ambos.`);
}

function rutaArchivoEstado(rol) {
  return path.join(ESTADO_DIR, `${rol}.json`);
}

// Configura interceptores y observadores por página
function configurarMonitoreo(page, rol) {
  const requestStartMap = new WeakMap();

  page.on('request', (req) => {
    if (req.url().includes('/api/')) {
      requestStartMap.set(req, Date.now());
    }
  });

  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/api/')) {
      let duracionMs = -1;
      if (requestStartMap.has(res.request())) {
        duracionMs = Date.now() - requestStartMap.get(res.request());
      }
      let rutaSinQuery = '';
      try {
        const u = new URL(url);
        rutaSinQuery = u.pathname;
      } catch {
        rutaSinQuery = url.split('?')[0];
      }
      const estado = res.status();
      const headers = res.headers();
      const xRequestId = headers['x-request-id'] || null;

      registroPeticiones.push({
        rol,
        fase: FASE,
        metodo: res.request().method(),
        ruta: rutaSinQuery,
        estado,
        ms: duracionMs,
        xRequestId,
      });

      // Clasificación de respuestas 5xx
      if (estado >= 500 && estado <= 599) {
        if (FASE === 'caida') {
          // En fase de caída, un 503 ante la parada de la BD es el comportamiento esperado
          if (estado !== 503) {
            respuestas5xxInesperadas++;
          }
        } else {
          // En cualquier otra fase, cualquier 5xx es inesperado
          respuestas5xxInesperadas++;
        }
      }
    }
  });

  // r003-1: Registrar peticiones fallidas a nivel de red (requestfailed)
  page.on('requestfailed', (req) => {
    const url = req.url();
    // r003-2: Ignorar extensiones de navegador
    if (url.startsWith('chrome-extension://')) {
      return;
    }
    // r004-2/r005-2 (Claude): un estado HTTP ya recibido no llega aquí (va por 'response').
    // ERR_ABORTED es una cancelación del navegador; solo se admite si la provocó el guion.
    if ((req.failure()?.errorText || '') === 'net::ERR_ABORTED' && transicionesEnCurso > 0) {
      cancelaciones.push({ rol, fase: FASE, metodo: req.method(), url: new URL(url).pathname });
      return;
    }
    peticionesFallidas.push({
      rol,
      fase: FASE,
      metodo: req.method(),
      url,
      error: req.failure()?.errorText || 'Fallo de red desconocido',
    });
  });

  // r003-2: Monitoreo de console.error
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const texto = msg.text();
      const locUrl = msg.location()?.url || '';

      // Ignora únicamente los errores cuyo origen sea chrome-extension://
      if (locUrl.startsWith('chrome-extension://') || texto.includes('chrome-extension://')) {
        return;
      }

      // r004-1 (Claude, archivo reasignado): en FASE=caida solo el error de recurso HTTP 503
      // de una ruta prevista; las tres condiciones a la vez.
      const RUTAS_503_PREVISTAS = ['/api/equipos', '/api/auth/sesion', '/api/estadisticas'];
      const es503Esperado = FASE === 'caida'
        && /Failed to load resource: the server responded with a status of 503/.test(texto)
        && RUTAS_503_PREVISTAS.some((ruta) => {
          try { return new URL(locUrl).pathname === ruta; } catch { return false; }
        });

      const entrada = {
        rol,
        fase: FASE,
        texto,
        url: locUrl || null,
        esperado: es503Esperado,
      };

      erroresConsola.push(entrada);

      if (!es503Esperado) {
        erroresConsolaInesperados.push(entrada);
      }
    }
  });

  // r003-2: Monitoreo de excepciones de página (pageerror)
  page.on('pageerror', (err) => {
    const texto = err?.message || String(err);
    const stack = err?.stack || '';

    // Ignora únicamente los errores cuyo origen sea chrome-extension://
    if (texto.includes('chrome-extension://') || stack.includes('chrome-extension://')) {
      return;
    }

    erroresPageError.push({
      rol,
      fase: FASE,
      texto,
      stack: stack || null,
    });
  });
}

// Inicia sesión mediante el formulario visual de la aplicación
async function loginViaUI(page, userConfig) {
  await page.goto(`${UI_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${UI_URL}/login`, { waitUntil: 'domcontentloaded' });

  await page.locator('#username').fill(userConfig.usuario);
  await page.locator('#password').fill(userConfig.clave);

  await Promise.all([
    page.waitForURL('**/menu-principal/dashboard', { timeout: 15000 }),
    page.locator('button.login-submit').click(),
  ]);

  const indicador = page.locator('[data-sesion="indicador"]');
  await indicador.waitFor({ state: 'visible', timeout: 8000 });

  const spanUsuario = page.locator('[data-sesion="usuario"]');
  const spanRol = page.locator('[data-sesion="rol"]');
  await spanUsuario.waitFor({ state: 'visible', timeout: 5000 });
  await spanRol.waitFor({ state: 'visible', timeout: 5000 });

  const textoUsuario = (await spanUsuario.innerText()).trim();
  const textoRol = (await spanRol.innerText()).trim();

  if (textoUsuario !== userConfig.usuario || textoRol !== userConfig.rolNombre) {
    throw new Error(
      `Indicador de sesión inesperado para ${userConfig.usuario}: se esperaba "${userConfig.usuario} · ${userConfig.rolNombre}", pero se obtuvo "${textoUsuario} · ${textoRol}"`
    );
  }
}

// r003-1: Navega a un módulo esperando la respuesta de su API principal (exige 200) y condición de pantalla cargada
async function navegarModulo(page, mod, timeoutMs = 20000) {
  const cfg = CONFIG_MODULOS[mod];
  if (!cfg) {
    throw new Error(`Módulo no reconocido en configuración: ${mod}`);
  }

  const destino = `/menu-principal/${mod}`;
  if (!page.url().includes(destino)) {
    const enlace = page.locator(`a.nav-link[href="${destino}"]`);
    await enlace.waitFor({ state: 'visible', timeout: 8000 });

    const [res] = await enTransicion(() => Promise.all([
      page.waitForResponse(
        (r) => r.url().includes(cfg.apiPattern) && r.request().method() === 'GET',
        { timeout: timeoutMs }
      ),
      page.waitForURL(`**${destino}`, { timeout: 12000 }),
      enlace.click(),
    ]));

    if (res.status() !== 200) {
      throw new Error(
        `Módulo ${cfg.nombre} (${mod}) devolvió HTTP ${res.status()} en ${cfg.apiPattern} (esperado 200)`
      );
    }
  } else {
    await page.waitForLoadState('domcontentloaded');
  }

  // Esperar condición de pantalla cargada
  if (cfg.selectorCarga) {
    await page.locator(cfg.selectorCarga).first().waitFor({ state: 'visible', timeout: 15000 });
  }
  // r004-2: no abandonar el módulo con peticiones secundarias pendientes.
  await page.waitForLoadState('networkidle', { timeout: 15000 });
}

// Ejecución de la fase "normal"
async function ejecutarFaseNormal(browser, rol) {
  const userConfig = USUARIOS[rol];
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  configurarMonitoreo(page, rol);

  const pasos = [];

  try {
    // 1. Inicio de sesión
    await loginViaUI(page, userConfig);
    pasos.push(`Login exitoso como ${userConfig.usuario}`);

    // 2. Primera entrada a Equipos
    await navegarModulo(page, 'equipos');
    const totalFilas1 = await page.locator('table.es-table tbody tr').count();
    if (totalFilas1 < 1) {
      throw new Error('Equipos cargó con 0 filas en la primera entrada');
    }
    pasos.push(`Primera entrada a Equipos: HTTP 200 con ${totalFilas1} filas`);

    // 3. Navegación por todos los módulos del rol con verificación de API (200) y pantalla cargada (r003-1)
    const modulos = userConfig.esAdmin ? MODULOS_ADMIN : MODULOS_USUARIO;
    for (const mod of modulos) {
      await navegarModulo(page, mod);
    }
    pasos.push(`Navegación completada por módulos con HTTP 200 y renderizado verificado: ${modulos.join(', ')}`);

    // Comprobación específica para rol usuario: Usuarios y Centros no deben verse
    if (!userConfig.esAdmin) {
      const cuentaUsuarios = await page
        .locator('a.nav-link[data-menu="usuarios"], a.nav-link[href="/menu-principal/usuarios"]')
        .count();
      if (cuentaUsuarios > 0) {
        throw new Error('El módulo Usuarios está visible en el menú para el rol usuario');
      }
      const cuentaCentros = await page.locator('a.nav-link[href="/menu-principal/centros"]').count();
      if (cuentaCentros > 0) {
        throw new Error('El módulo Centros asistenciales está visible en el menú para el rol usuario');
      }
      pasos.push('Verificado: módulos exclusivos de admin (Usuarios, Centros) no aparecen en el menú');
    }

    // 4. Volver al Dashboard, esperar inactividad y volver a Equipos
    await navegarModulo(page, 'dashboard');
    pasos.push('Retorno a Dashboard antes del periodo de inactividad');

    if (INACTIVIDAD_S > 0) {
      // r003-3: empezar a contar después de que terminen las peticiones pendientes (networkidle)
      await page.waitForLoadState('networkidle');
      pasos.push(`Peticiones de red finalizadas (networkidle); iniciando espera de inactividad de ${INACTIVIDAD_S} s`);
      await new Promise((resolve) => setTimeout(resolve, INACTIVIDAD_S * 1000));
      pasos.push(`Espera de inactividad completada: ${INACTIVIDAD_S} s`);
    }

    await navegarModulo(page, 'equipos');
    const totalFilas2 = await page.locator('table.es-table tbody tr').count();
    if (totalFilas2 < 1) {
      throw new Error('Equipos cargó con 0 filas tras el periodo de inactividad');
    }
    pasos.push(`Segunda entrada a Equipos tras inactividad: HTTP 200 con ${totalFilas2} filas`);

    return { ok: true, pasos };
  } finally {
    await enTransicion(() => context.close()).catch(() => {});
  }
}

// Ejecución de la fase "sesion"
async function ejecutarFaseSesion(browser, rol) {
  const userConfig = USUARIOS[rol];
  fs.mkdirSync(ESTADO_DIR, { recursive: true });
  const archivoDestino = rutaArchivoEstado(rol);

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  configurarMonitoreo(page, rol);

  const pasos = [];

  try {
    await loginViaUI(page, userConfig);
    pasos.push(`Login exitoso como ${userConfig.usuario}`);

    // Guardar estado de autenticación (cookies y localStorage sin mostrar secretos)
    await context.storageState({ path: archivoDestino });
    pasos.push(`Estado de sesión guardado exitosamente en: ${archivoDestino}`);

    return { ok: true, pasos };
  } finally {
    await enTransicion(() => context.close()).catch(() => {});
  }
}

// Ejecución de la fase "caida"
async function ejecutarFaseCaida(browser, rol) {
  const archivoEstado = rutaArchivoEstado(rol);
  if (!fs.existsSync(archivoEstado)) {
    throw new Error(
      `No se encontró el estado guardado para "${rol}" en ${archivoEstado}. Ejecute primero FASE=sesion.`
    );
  }

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    storageState: archivoEstado,
  });
  const page = await context.newPage();
  configurarMonitoreo(page, rol);

  const pasos = [];

  try {
    // 1. Entrar a Equipos con la base de datos caída y medir tiempo desde el evento request (r003-3)
    let requestTimestamp = null;
    const onRequestEquipos = (req) => {
      if (req.url().includes('/api/equipos') && req.method() === 'GET' && requestTimestamp === null) {
        requestTimestamp = Date.now();
      }
    };
    page.on('request', onRequestEquipos);

    let resEquipos;
    try {
      [resEquipos] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/api/equipos') && r.request().method() === 'GET',
          { timeout: 15000 }
        ),
        page.goto(`${UI_URL}/menu-principal/equipos`, { waitUntil: 'domcontentloaded' }),
      ]);
    } finally {
      page.off('request', onRequestEquipos);
    }

    const finResponse = Date.now();
    const duracionMs = requestTimestamp !== null ? (finResponse - requestTimestamp) : -1;
    const estadoRespuesta = resEquipos.status();

    if (estadoRespuesta !== 503) {
      throw new Error(
        `Se esperaba HTTP 503 en /api/equipos durante la caída de la base, pero se recibió ${estadoRespuesta}`
      );
    }
    if (duracionMs < 0 || duracionMs >= 15000) {
      throw new Error(`La respuesta 503 tardó ${duracionMs} ms (debe ser menor a 15 s medido desde el evento request)`);
    }
    pasos.push(`/api/equipos respondió 503 en ${duracionMs} ms (< 15 s medido desde el evento request)`);

    // 2. Verificar que aparece el aviso SweetAlert2 con el texto indicado
    const popup = page.locator('.swal2-popup');
    await popup.waitFor({ state: 'visible', timeout: 10000 });
    const textoAviso = (await popup.innerText()).trim();
    if (!textoAviso.includes('Error de conexión con el servidor')) {
      throw new Error(
        `El aviso en pantalla no contiene el mensaje esperado «Error de conexión con el servidor». Recibido: "${textoAviso}"`
      );
    }
    pasos.push('Aviso SweetAlert2 «Error de conexión con el servidor» visible en pantalla');

    // 3. Comprobar que la página no se queda colgada: cerrar aviso y probar navegación de menú
    const botonConfirmar = popup.locator('button.swal2-confirm');
    await botonConfirmar.waitFor({ state: 'visible', timeout: 5000 });
    await botonConfirmar.click();
    await popup.waitFor({ state: 'hidden', timeout: 5000 });
    pasos.push('Aviso cerrado exitosamente');

    const linkDashboard = page.locator('a.nav-link[href="/menu-principal/dashboard"]');
    await linkDashboard.waitFor({ state: 'visible', timeout: 5000 });
    // r005-1 (Claude): esperar la consulta del Dashboard y exigir su 503 controlado.
    const [resEstadisticas] = await enTransicion(() => Promise.all([
      page.waitForResponse((r) => new URL(r.url()).pathname === '/api/estadisticas' && r.request().method() === 'GET', { timeout: 15000 }),
      page.waitForURL('**/menu-principal/dashboard', { timeout: 8000 }),
      linkDashboard.click(),
    ]));
    if (resEstadisticas.status() !== 503) {
      throw new Error(`Se esperaba HTTP 503 en /api/estadisticas durante la caída, pero se recibió ${resEstadisticas.status()}`);
    }
    pasos.push('El menú lateral sigue respondiendo tras la caída: Dashboard abierto y /api/estadisticas respondió 503 controlado');

    return { ok: true, pasos };
  } finally {
    await enTransicion(() => context.close()).catch(() => {});
  }
}

// Ejecución de la fase "recuperacion"
async function ejecutarFaseRecuperacion(browser, rol) {
  const archivoEstado = rutaArchivoEstado(rol);
  if (!fs.existsSync(archivoEstado)) {
    throw new Error(
      `No se encontró el estado guardado para "${rol}" en ${archivoEstado}. Ejecute primero FASE=sesion.`
    );
  }

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    storageState: archivoEstado,
  });
  const page = await context.newPage();
  configurarMonitoreo(page, rol);

  const pasos = [];

  try {
    // 1. Entrar a Equipos con la sesión guardada y comprobar 200 sin nuevo login
    const [resEquipos] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/equipos') && r.request().method() === 'GET',
        { timeout: 15000 }
      ),
      page.goto(`${UI_URL}/menu-principal/equipos`, { waitUntil: 'domcontentloaded' }),
    ]);
    if (resEquipos.status() !== 200) {
      throw new Error(`Equipos en recuperación devolvió HTTP ${resEquipos.status()} (esperado 200)`);
    }
    await page.locator('table.es-table tbody tr').first().waitFor({ state: 'visible', timeout: 15000 });
    const filasEquipos = await page.locator('table.es-table tbody tr').count();
    if (filasEquipos < 1) {
      throw new Error('Equipos en recuperación no cargó ninguna fila');
    }
    pasos.push(`Equipos en recuperación: HTTP 200 con ${filasEquipos} filas cargadas`);

    // 2. Navegar a otro módulo (Lugares) comprobando HTTP 200 y renderizado (r003-1)
    await navegarModulo(page, 'lugares');
    pasos.push('Módulo alternativo (Lugares) en recuperación: HTTP 200 y pantalla cargada');

    // 3. Confirmar que no hubo redirección a login y que la sesión se mantiene
    if (page.url().includes('/login')) {
      throw new Error('La página fue redirigida a /login durante la recuperación');
    }
    const indicador = page.locator('[data-sesion="indicador"]');
    await indicador.waitFor({ state: 'visible', timeout: 5000 });
    pasos.push('Sesión mantenida sin volver a ingresar credenciales');

    return { ok: true, pasos };
  } finally {
    await enTransicion(() => context.close()).catch(() => {});
  }
}

// Orquestador principal
async function main() {
  let browser = null;
  const roles = resolverRoles(ROL_ENV);
  resultadoFinal.rolesEjecutados = roles;

  try {
    if (!['normal', 'sesion', 'caida', 'recuperacion'].includes(FASE)) {
      throw new Error(`FASE "${FASE}" no válida. Opciones: normal | sesion | caida | recuperacion.`);
    }

    browser = await chromium.launch({
      channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
      headless: true,
    });

    for (const rol of roles) {
      let resultadoRol = null;
      if (FASE === 'normal') {
        resultadoRol = await ejecutarFaseNormal(browser, rol);
      } else if (FASE === 'sesion') {
        resultadoRol = await ejecutarFaseSesion(browser, rol);
      } else if (FASE === 'caida') {
        resultadoRol = await ejecutarFaseCaida(browser, rol);
      } else if (FASE === 'recuperacion') {
        resultadoRol = await ejecutarFaseRecuperacion(browser, rol);
      }
      resultadoFinal.resultadosPorRol[rol] = resultadoRol;
    }

    // r003-2: Evaluación de fallos globales ante excepciones, errores de consola y peticiones fallidas
    const motivosFallo = [];
    if (respuestas5xxInesperadas > 0) {
      motivosFallo.push(`${respuestas5xxInesperadas} respuestas 5xx inesperadas en la API`);
    }
    if (erroresPageError.length > 0) {
      motivosFallo.push(`${erroresPageError.length} excepción(es) pageerror`);
    }
    if (erroresConsolaInesperados.length > 0) {
      motivosFallo.push(`${erroresConsolaInesperados.length} error(es) de consola inesperado(s)`);
    }
    if (peticionesFallidas.length > 0) {
      motivosFallo.push(`${peticionesFallidas.length} petición(es) de red fallida(s) (requestfailed)`);
    }

    if (motivosFallo.length > 0) {
      resultadoFinal.ok = false;
      resultadoFinal.motivoFallo = `Se detectaron fallos durante la ejecución: ${motivosFallo.join('; ')}.`;
      resultadoFinal.resumen = `Fase ${FASE} con anomalías: ${motivosFallo.join(', ')}.`;
    } else {
      resultadoFinal.ok = true;
      resultadoFinal.resumen = `Fase ${FASE} completada exitosamente para rol(es): ${roles.join(', ')}.`;
    }
  } catch (err) {
    resultadoFinal.ok = false;
    resultadoFinal.motivoFallo = err?.message || String(err);
    resultadoFinal.resumen = `Fallo durante la fase ${FASE}: ${resultadoFinal.motivoFallo}`;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }

    // r003-4: Copiar acumuladores al resultado en finally antes de imprimir el JSON
    resultadoFinal.respuestas5xxInesperadas = respuestas5xxInesperadas;
    resultadoFinal.totalPeticionesApi = registroPeticiones.length;
    resultadoFinal.erroresConsola = erroresConsola;
    resultadoFinal.erroresConsolaInesperados = erroresConsolaInesperados;
    resultadoFinal.erroresPageError = erroresPageError;
    resultadoFinal.peticionesFallidas = peticionesFallidas;
    resultadoFinal.cancelaciones = cancelaciones;
    resultadoFinal.registroPeticiones = registroPeticiones;

    // Si hubo errores acumulados pero no se evaluaron por salida prematura en catch, asegurar ok: false
    if (resultadoFinal.ok && (
      respuestas5xxInesperadas > 0 ||
      erroresPageError.length > 0 ||
      erroresConsolaInesperados.length > 0 ||
      peticionesFallidas.length > 0
    )) {
      resultadoFinal.ok = false;
      resultadoFinal.motivoFallo = resultadoFinal.motivoFallo || 'Errores acumulados detectados durante el monitoreo.';
    }

    // Imprimir resultado estructurado en formato JSON puro por stdout
    console.log(JSON.stringify(resultadoFinal, null, 2));

    // Código de salida estándar: 0 si todo coincide con lo esperado, 1 si no
    process.exit(resultadoFinal.ok ? 0 : 1);
  }
}

main();
