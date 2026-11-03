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

async function apiJson(ruta, { method = 'GET', token = null, body = undefined } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_URL}${ruta}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, body: data };
}

async function apiLogin({ usuario, clave }) {
  const { status, body } = await apiJson('/api/auth/login', {
    method: 'POST',
    body: { nombreUsuario: usuario, contrasena: clave },
  });
  if (status !== 200 || !body?.token) {
    throw new Error(`Fallo en apiLogin(${usuario}): HTTP ${status} - ${body?.message || 'sin token'}`);
  }
  const sesionRes = await apiJson('/api/auth/sesion', { token: body.token });
  if (sesionRes.status !== 200 || !sesionRes.body?.data?.idUsuario) {
    throw new Error(`Fallo al consultar /api/auth/sesion para ${usuario}: HTTP ${sesionRes.status}`);
  }
  return {
    token: body.token,
    idUsuario: Number(sesionRes.body.data.idUsuario),
    sesion: sesionRes.body.data,
  };
}

async function apiCrearUsuario(token, { nombre_usuario, contrasena, id_rol }) {
  const { status, body } = await apiJson('/api/usuarios', {
    method: 'POST',
    token,
    body: { nombre_usuario, contrasena, id_rol },
  });
  if ((status !== 200 && status !== 201) || !body?.data?.id_usuario) {
    throw new Error(
      `Fallo creando precondición ${nombre_usuario}: HTTP ${status} - ${body?.message || ''}`
    );
  }
  return body.data;
}

async function apiCambiarEstado(token, idUsuario, activo) {
  return apiJson(`/api/usuarios/${idUsuario}/estado`, {
    method: 'PATCH',
    token,
    body: { activo },
  });
}

async function asegurarUnicoAdminActivo(tokenAdminPrincipal, idAdminPrincipal) {
  let pagina = 1;
  let totalPaginas = 1;
  const otrosAdminsActivos = [];

  while (pagina <= totalPaginas) {
    const { status, body } = await apiJson(
      `/api/usuarios?estado=activos&page=${pagina}&pageSize=50`,
      { token: tokenAdminPrincipal }
    );
    if (status !== 200) break;
    const lista = body?.data?.data || [];
    totalPaginas = Number(body?.data?.totalPages) || 1;
    for (const u of lista) {
      if ((Number(u.id_rol) === 1 || u.rol === 'admin') && Number(u.id_usuario) !== idAdminPrincipal) {
        otrosAdminsActivos.push(Number(u.id_usuario));
      }
    }
    pagina++;
  }

  for (const idOtro of otrosAdminsActivos) {
    await apiCambiarEstado(tokenAdminPrincipal, idOtro, false);
  }
}

async function loginViaUI(page, { usuario, clave }) {
  await page.goto(`${UI_URL}/login`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${UI_URL}/login`, { waitUntil: 'networkidle' });

  await page.locator('#username').fill(usuario);
  await page.locator('#password').fill(clave);
  await Promise.all([
    page.waitForURL('**/menu-principal/dashboard', { timeout: 10000 }),
    page.locator('button.login-submit').click(),
  ]);
  await page.locator('[data-sesion="indicador"]').waitFor({ state: 'visible', timeout: 5000 });
}

async function irAUsuarios(page) {
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/api/usuarios') && r.request().method() === 'GET'
    ),
    page.goto(`${UI_URL}/menu-principal/usuarios`, { waitUntil: 'domcontentloaded' }),
  ]);
}

async function buscarUsuarioEnTabla(page, nombreUsuario) {
  const fila = page.locator(`tr[data-usuario="${nombreUsuario}"]`);
  if (await fila.isVisible()) {
    return fila;
  }
  const inputBusqueda = page.locator('#buscarUsuarios');
  await inputBusqueda.fill(nombreUsuario);
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes('/api/usuarios') &&
        r.url().includes('search=') &&
        r.request().method() === 'GET'
    ),
    page.locator('button[data-accion="buscar-usuarios"]').click(),
  ]);
  await fila.waitFor({ state: 'visible', timeout: 5000 });
  return fila;
}

async function limpiarModales(page) {
  try {
    const swalCancel = page.locator('button.swal2-cancel');
    if (await swalCancel.isVisible()) {
      await swalCancel.click();
      await swalCancel.waitFor({ state: 'hidden', timeout: 2000 }).catch(() => {});
    }
    const swalConfirm = page.locator('button.swal2-confirm');
    if (await swalConfirm.isVisible()) {
      await swalConfirm.click();
      await swalConfirm.waitFor({ state: 'hidden', timeout: 2000 }).catch(() => {});
    }
    const btnClose = page.locator('#usuarioModal.show button.btn-close');
    if (await btnClose.isVisible()) {
      await btnClose.click();
      await page.locator('#usuarioModal').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
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
        await page.setViewportSize({ width: 1440, height: 900 });
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
    // FLUJO (a): Indicador de sesión, nota Trabajadores, alta, validación y edición
    // =========================================================================
    await runFlow(
      'usuarios-a-crud-admin',
      'E2E-a: Indicador de sesión de admin, nota diferencial con Trabajadores, alta, validación de duplicado y edición',
      async () => {
        const userA = `user_a_${SUFIJO}`;
        const userARenombrado = `user_a_edit_${SUFIJO}`;
        const claveUserA = `User.A.${SUFIJO}`;

        await loginViaUI(page, USERS.admin);

        const indicador = page.locator('[data-sesion="indicador"]');
        await indicador.waitFor({ state: 'visible', timeout: 5000 });
        const textoUsuario = (await page.locator('[data-sesion="usuario"]').innerText()).trim();
        const textoRol = (await page.locator('[data-sesion="rol"]').innerText()).trim();
        if (textoUsuario !== USERS.admin.usuario || textoRol !== 'Administrador') {
          throw new Error(`Indicador inesperado: usuario="${textoUsuario}", rol="${textoRol}"`);
        }

        const linkMenu = page
          .locator('a.nav-link[data-menu="usuarios"], a.nav-link:has-text("Usuarios")')
          .first();
        await linkMenu.waitFor({ state: 'visible', timeout: 5000 });
        await Promise.all([
          page.waitForURL('**/menu-principal/usuarios', { timeout: 5000 }),
          page.waitForResponse(
            (r) => r.url().includes('/api/usuarios') && r.request().method() === 'GET'
          ),
          linkMenu.click(),
        ]);

        const notaTrabajadores = page.locator('[data-nota="distincion-trabajadores"]');
        await notaTrabajadores.waitFor({ state: 'visible', timeout: 5000 });

        // 1. Abrir modal de Nuevo usuario y comprobar validación en cliente (incluyendo #contrasenaModal-error)
        await page.locator('button[data-accion="nuevo-usuario"]').click();
        const modal = page.locator('#usuarioModal');
        await modal.waitFor({ state: 'visible', timeout: 5000 });

        const inputNombre = modal.locator('#nombreUsuarioModal');
        const selectRol = modal.locator('#rolUsuarioModal');
        const inputClave = modal.locator('#contrasenaUsuarioModal');
        const inputConfirmar = modal.locator('#confirmarContrasenaModal');
        const btnGuardar = modal.locator('button[data-accion="guardar-usuario"]');

        await inputNombre.fill('nombre invalido');
        await inputClave.fill('corta1');
        await inputConfirmar.fill('distinta');
        await btnGuardar.click();

        await modal.locator('#nombreUsuarioModal-error').waitFor({ state: 'visible', timeout: 3000 });
        await modal.locator('#contrasenaModal-error').waitFor({ state: 'visible', timeout: 3000 });
        await modal.locator('#confirmarContrasenaModal-error').waitFor({ state: 'visible', timeout: 3000 });

        // 2. Crear cuenta de usuario normal (user_a_...)
        await inputNombre.fill(userA);
        await selectRol.selectOption({ label: 'Usuario' });
        await inputClave.fill(claveUserA);
        await inputConfirmar.fill(claveUserA);
        await Promise.all([
          page.waitForResponse(
            (r) => r.url().endsWith('/api/usuarios') && r.request().method() === 'POST'
          ),
          page.waitForResponse(
            (r) => r.url().includes('/api/usuarios') && r.request().method() === 'GET'
          ),
          btnGuardar.click(),
        ]);
        await modal.waitFor({ state: 'hidden', timeout: 5000 });

        const filaUser = await buscarUsuarioEnTabla(page, userA);
        await filaUser.waitFor({ state: 'visible', timeout: 5000 });

        // 3. Intentar crear duplicado en mayúsculas -> 409 exacto en el campo nombre_usuario
        await page.locator('button[data-accion="nuevo-usuario"]').click();
        await modal.waitFor({ state: 'visible', timeout: 5000 });
        await inputNombre.fill(userA.toUpperCase());
        await selectRol.selectOption({ label: 'Usuario' });
        await inputClave.fill(claveUserA);
        await inputConfirmar.fill(claveUserA);

        const [resDup] = await Promise.all([
          page.waitForResponse(
            (r) => r.url().endsWith('/api/usuarios') && r.request().method() === 'POST'
          ),
          btnGuardar.click(),
        ]);
        if (resDup.status() !== 409) {
          throw new Error(`Se esperaba 409 al crear usuario duplicado y se obtuvo ${resDup.status()}`);
        }

        const errorNombre = modal.locator('#nombreUsuarioModal-error');
        await errorNombre.waitFor({ state: 'visible', timeout: 5000 });
        const msgDup = (await errorNombre.innerText()).trim();
        if (msgDup !== 'Ya existe un usuario con ese nombre.') {
          throw new Error(`Mensaje de duplicado inesperado: "${msgDup}"`);
        }
        await modal.locator('button[data-accion="cancelar-usuario"]').click();
        await modal.waitFor({ state: 'hidden', timeout: 5000 });

        // 4. Editar nombre de user_a_... y devolverlo a su nombre original
        await filaUser.locator('button[data-accion="editar-usuario"]').click();
        await modal.waitFor({ state: 'visible', timeout: 5000 });
        await inputNombre.fill(userARenombrado);
        await Promise.all([
          page.waitForResponse(
            (r) => r.url().includes('/api/usuarios/') && r.request().method() === 'PUT'
          ),
          page.waitForResponse(
            (r) => r.url().includes('/api/usuarios') && r.request().method() === 'GET'
          ),
          btnGuardar.click(),
        ]);
        await modal.waitFor({ state: 'hidden', timeout: 5000 });

        const filaRenombrada = await buscarUsuarioEnTabla(page, userARenombrado);
        await filaRenombrada.waitFor({ state: 'visible', timeout: 5000 });

        await filaRenombrada.locator('button[data-accion="editar-usuario"]').click();
        await modal.waitFor({ state: 'visible', timeout: 5000 });
        await inputNombre.fill(userA);
        await Promise.all([
          page.waitForResponse(
            (r) => r.url().includes('/api/usuarios/') && r.request().method() === 'PUT'
          ),
          page.waitForResponse(
            (r) => r.url().includes('/api/usuarios') && r.request().method() === 'GET'
          ),
          btnGuardar.click(),
        ]);
        await modal.waitFor({ state: 'hidden', timeout: 5000 });

        const filaRestaurada = await buscarUsuarioEnTabla(page, userA);
        await filaRestaurada.waitFor({ state: 'visible', timeout: 5000 });

        return `Indicador="${textoUsuario} · ${textoRol}", creado y editado="${userA}", duplicado 409="${msgDup}"`;
      }
    );

    // =========================================================================
    // FLUJO (b): Desactivar, filtro Inactivos, login 403 y reactivar
    // =========================================================================
    await runFlow(
      'usuarios-b-estado-y-login-403',
      'E2E-b: Desactivar cuenta con confirmación, filtrar por Inactivos, verificar login 403 y reactivar',
      async () => {
        // Precondición propia por API (independiente de E2E-a)
        const { token: tokenAdmin } = await apiLogin(USERS.admin);
        const userB = `user_b_${SUFIJO}`;
        const claveUserB = `User.B.${SUFIJO}`;
        const creadoB = await apiCrearUsuario(tokenAdmin, {
          nombre_usuario: userB,
          contrasena: claveUserB,
          id_rol: 2,
        });
        const idUserB = Number(creadoB.id_usuario);

        await loginViaUI(page, USERS.admin);
        await irAUsuarios(page);

        const filaUser = await buscarUsuarioEnTabla(page, userB);
        await filaUser.locator('button[data-accion="cambiar-estado"]').click();

        const popupSwal = page.locator('.swal2-popup.es-alert');
        await popupSwal.waitFor({ state: 'visible', timeout: 5000 });
        const textoConfirmacion = (await popupSwal.innerText()).trim();
        if (!textoConfirmacion.includes('sesiones') || !textoConfirmacion.includes('historial')) {
          throw new Error(`La confirmación no explica los efectos: "${textoConfirmacion}"`);
        }

        const [resPatchDesactivar] = await Promise.all([
          page.waitForResponse(
            (r) =>
              r.url().endsWith(`/api/usuarios/${idUserB}/estado`) &&
              r.request().method() === 'PATCH'
          ),
          page.waitForResponse(
            (r) => r.url().includes('/api/usuarios') && r.request().method() === 'GET'
          ),
          popupSwal.locator('button.swal2-confirm').click(),
        ]);
        if (resPatchDesactivar.status() !== 200) {
          throw new Error(`PATCH desactivar devolvió ${resPatchDesactivar.status()}`);
        }

        await filaUser
          .locator('[data-columna="estado"]:has-text("Inactiva")')
          .waitFor({ state: 'visible', timeout: 5000 });

        // Filtrar por Inactivos y comprobar que aparece la cuenta
        await Promise.all([
          page.waitForResponse(
            (r) =>
              r.url().includes('/api/usuarios') &&
              r.url().includes('estado=inactivos') &&
              r.request().method() === 'GET'
          ),
          page.locator('#estadoUsuarios').selectOption('inactivos'),
        ]);
        await filaUser.waitFor({ state: 'visible', timeout: 5000 });

        await Promise.all([
          page.waitForResponse(
            (r) =>
              r.url().includes('/api/usuarios') &&
              r.url().includes('estado=todos') &&
              r.request().method() === 'GET'
          ),
          page.locator('button[data-accion="limpiar-filtros"]').click(),
        ]);

        // Intentar iniciar sesión con la cuenta inactiva y su contraseña correcta -> 403 exacto
        await page.goto(`${UI_URL}/login`, { waitUntil: 'networkidle' });
        await page.evaluate(() => localStorage.clear());
        await page.goto(`${UI_URL}/login`, { waitUntil: 'networkidle' });

        await page.locator('#username').fill(userB);
        await page.locator('#password').fill(claveUserB);
        const [resLoginInactivo] = await Promise.all([
          page.waitForResponse(
            (r) => r.url().endsWith('/api/auth/login') && r.request().method() === 'POST'
          ),
          page.locator('button.login-submit').click(),
        ]);
        if (resLoginInactivo.status() !== 403) {
          throw new Error(`Se esperaba 403 en login de cuenta inactiva y se obtuvo ${resLoginInactivo.status()}`);
        }

        const alertaLogin = page.locator('#login-error');
        await alertaLogin.waitFor({ state: 'visible', timeout: 5000 });
        const msgInactiva = (await alertaLogin.innerText()).trim();
        if (msgInactiva !== 'La cuenta está desactivada. Contacte con un administrador.') {
          throw new Error(`Mensaje de login para cuenta inactiva inesperado: "${msgInactiva}"`);
        }

        // Volver como admin, reactivar y comprobar que userB ya puede iniciar sesión
        await loginViaUI(page, USERS.admin);
        await irAUsuarios(page);

        const filaInactiva = await buscarUsuarioEnTabla(page, userB);
        await filaInactiva.locator('button[data-accion="cambiar-estado"]').click();
        await popupSwal.waitFor({ state: 'visible', timeout: 5000 });

        const [resPatchReactivar] = await Promise.all([
          page.waitForResponse(
            (r) =>
              r.url().endsWith(`/api/usuarios/${idUserB}/estado`) &&
              r.request().method() === 'PATCH'
          ),
          page.waitForResponse(
            (r) => r.url().includes('/api/usuarios') && r.request().method() === 'GET'
          ),
          popupSwal.locator('button.swal2-confirm').click(),
        ]);
        if (resPatchReactivar.status() !== 200) {
          throw new Error(`PATCH reactivar devolvió ${resPatchReactivar.status()}`);
        }

        await filaInactiva
          .locator('[data-columna="estado"]:has-text("Activa")')
          .waitFor({ state: 'visible', timeout: 5000 });

        await loginViaUI(page, { usuario: userB, clave: claveUserB });
        const indUsuario = (await page.locator('[data-sesion="usuario"]').innerText()).trim();
        const indRol = (await page.locator('[data-sesion="rol"]').innerText()).trim();
        if (indUsuario !== userB || indRol !== 'Usuario') {
          throw new Error(`Indicador tras reactivar inesperado: "${indUsuario} · ${indRol}"`);
        }

        return `id=${idUserB} Desactivada -> Login 403 ("${msgInactiva}") -> Reactivada -> Login OK`;
      }
    );

    // =========================================================================
    // FLUJO (c): Protección de la propia cuenta y del último administrador
    // =========================================================================
    await runFlow(
      'usuarios-c-propia-cuenta-y-ultimo-admin',
      'E2E-c: Propia cuenta con rol/estado protegidos y bloqueo 409 real del último administrador y de borrado',
      async () => {
        // Precondición propia por API: obtener id real de admin_prueba, dejarlo como único admin activo
        // y crear un segundo administrador A2 para demostrar el bloqueo 409 del último administrador.
        const { token: tokenAdmin1, idUsuario: idAdmin1 } = await apiLogin(USERS.admin);
        await asegurarUnicoAdminActivo(tokenAdmin1, idAdmin1);

        const admin2Nombre = `admin_c_${SUFIJO}`;
        const admin2Clave = `Admin.C.${SUFIJO}`;
        const creadoAdmin2 = await apiCrearUsuario(tokenAdmin1, {
          nombre_usuario: admin2Nombre,
          contrasena: admin2Clave,
          id_rol: 1,
        });
        const idAdmin2 = Number(creadoAdmin2.id_usuario);
        const { token: tokenAdmin2 } = await apiLogin({
          usuario: admin2Nombre,
          clave: admin2Clave,
        });

        try {
          await loginViaUI(page, USERS.admin);
          await irAUsuarios(page);

          const filaPropia = await buscarUsuarioEnTabla(page, USERS.admin.usuario);

          if ((await filaPropia.locator('[data-distintivo="sesion-actual"]').count()) !== 1) {
            throw new Error('La fila de la propia cuenta no muestra el distintivo «Sesión actual».');
          }
          if ((await filaPropia.locator('button[data-accion="cambiar-estado"]').count()) !== 0) {
            throw new Error('La fila de la propia cuenta no debe mostrar botón de desactivar.');
          }

          // Abrir modal de edición de la propia cuenta y comprobar rol deshabilitado (estado y aspecto visual)
          await filaPropia.locator('button[data-accion="editar-usuario"]').click();
          const modal = page.locator('#usuarioModal');
          await modal.waitFor({ state: 'visible', timeout: 5000 });

          const selectRol = modal.locator('#rolUsuarioModal');
          if (!(await selectRol.isDisabled())) {
            throw new Error('El selector de rol debe estar deshabilitado al editar la propia cuenta.');
          }
          const estiloRolDeshabilitado = await selectRol.evaluate((el) => {
            const cs = window.getComputedStyle(el);
            return { cursor: cs.cursor, backgroundColor: cs.backgroundColor };
          });
          if (estiloRolDeshabilitado.cursor !== 'not-allowed') {
            throw new Error(
              `El selector de rol deshabilitado debe tener cursor not-allowed y tiene "${estiloRolDeshabilitado.cursor}".`
            );
          }

          await modal.locator('[data-nota="cuenta-propia"]').waitFor({ state: 'visible', timeout: 3000 });
          await modal.locator('[data-aviso="cambio-clave-propia"]').waitFor({ state: 'visible', timeout: 3000 });
          await modal.locator('button[data-accion="cancelar-usuario"]').click();
          await modal.waitFor({ state: 'hidden', timeout: 5000 });

          // 1. Protección de la propia cuenta (409 exacto en PATCH estado y PUT rol)
          const resPropiaEstado = await apiCambiarEstado(tokenAdmin1, idAdmin1, false);
          const resPropiaRol = await apiJson(`/api/usuarios/${idAdmin1}`, {
            method: 'PUT',
            token: tokenAdmin1,
            body: { nombre_usuario: USERS.admin.usuario, id_rol: 2 },
          });
          const msgEsperadoPropia =
            'No puede cambiar su propio rol ni desactivar su propia cuenta.';
          if (
            resPropiaEstado.status !== 409 ||
            resPropiaEstado.body?.message !== msgEsperadoPropia ||
            resPropiaRol.status !== 409 ||
            resPropiaRol.body?.message !== msgEsperadoPropia
          ) {
            throw new Error(
              `Respuesta inesperada en protección de cuenta propia: PATCH=${resPropiaEstado.status}("${resPropiaEstado.body?.message}"), PUT=${resPropiaRol.status}("${resPropiaRol.body?.message}")`
            );
          }

          // 2. Protección del último administrador activo (409 «Debe quedar al menos un administrador activo.»):
          // Con exactamente 2 administradores activos (admin_prueba y A2), A2 inicia la degradación de
          // admin_prueba con contraseña (pasa verifyToken mientras ambos están activos y calcula bcrypt)
          // mientras admin_prueba desactiva a A2 (200). Al entrar A2 en la transacción bajo el candado
          // consultivo, admin_prueba ya es el único administrador activo restante y recibe 409 exacto.
          const [resDesactivarA2, resDegradarUltimoAdmin] = await Promise.all([
            apiCambiarEstado(tokenAdmin1, idAdmin2, false),
            apiJson(`/api/usuarios/${idAdmin1}`, {
              method: 'PUT',
              token: tokenAdmin2,
              body: {
                nombre_usuario: USERS.admin.usuario,
                id_rol: 2,
                contrasena: `Clave.Temp.${SUFIJO}`,
              },
            }),
          ]);

          const msgEsperadoUltimo = 'Debe quedar al menos un administrador activo.';
          if (
            resDesactivarA2.status !== 200 ||
            resDegradarUltimoAdmin.status !== 409 ||
            resDegradarUltimoAdmin.body?.message !== msgEsperadoUltimo
          ) {
            throw new Error(
              `Se esperaba 200 al desactivar A2 (${resDesactivarA2.status}) y 409 "${msgEsperadoUltimo}" al degradar al último admin (${resDegradarUltimoAdmin.status}: "${resDegradarUltimoAdmin.body?.message}")`
            );
          }

          // 3. Prohibición de borrado físico (DELETE -> 409 exacto)
          const resDelete = await apiJson(`/api/usuarios/${idAdmin2}`, {
            method: 'DELETE',
            token: tokenAdmin1,
          });
          const msgEsperadoDelete =
            'Las cuentas no se eliminan: desactívela para conservar su historial.';
          if (resDelete.status !== 409 || resDelete.body?.message !== msgEsperadoDelete) {
            throw new Error(
              `Respuesta inesperada en DELETE: ${resDelete.status} ("${resDelete.body?.message}")`
            );
          }

          return `idAdmin1=${idAdmin1}, idAdmin2=${idAdmin2}, propia=409("${resPropiaEstado.body.message}"), últimoAdmin=409("${resDegradarUltimoAdmin.body.message}"), delete=409`;
        } finally {
          // Garantizar que los datos quedan como estaban: admin_prueba activo y A2 inactivo
          await apiCambiarEstado(tokenAdmin1, idAdmin2, false).catch(() => {});
        }
      }
    );

    // =========================================================================
    // FLUJO (d): Usuario normal (indicador Usuario, sin menú, AdminGuard y 403 API)
    // =========================================================================
    await runFlow(
      'usuarios-d-permisos-usuario-normal',
      'E2E-d: Usuario normal ve su indicador, no ve enlace Usuarios, ruta redirige y API responde 403',
      async () => {
        const { idUsuario: idAdmin1 } = await apiLogin(USERS.admin);
        await loginViaUI(page, USERS.user);

        const textoUsuario = (await page.locator('[data-sesion="usuario"]').innerText()).trim();
        const textoRol = (await page.locator('[data-sesion="rol"]').innerText()).trim();
        if (textoUsuario !== USERS.user.usuario || textoRol !== 'Usuario') {
          throw new Error(`Indicador de usuario normal inesperado: "${textoUsuario} · ${textoRol}"`);
        }

        const enlaceUsuarios = await page.locator('a.nav-link[data-menu="usuarios"]').count();
        if (enlaceUsuarios > 0) {
          throw new Error('El usuario normal no debe ver el enlace «Usuarios» en el menú.');
        }

        await page.goto(`${UI_URL}/menu-principal/usuarios`, { waitUntil: 'networkidle' });
        await page.waitForURL('**/menu-principal/dashboard', { timeout: 5000 });

        const tokenUsuario = await page.evaluate(() => localStorage.getItem('authToken'));
        const respuestas = await Promise.all([
          apiJson('/api/usuarios', { token: tokenUsuario }),
          apiJson(`/api/usuarios/${idAdmin1}`, { token: tokenUsuario }),
          apiJson('/api/usuarios', {
            method: 'POST',
            token: tokenUsuario,
            body: { nombre_usuario: 'intento', contrasena: 'Clave.Intento1', id_rol: 1 },
          }),
          apiJson(`/api/usuarios/${idAdmin1}`, {
            method: 'PUT',
            token: tokenUsuario,
            body: { nombre_usuario: 'intento', id_rol: 1 },
          }),
          apiJson(`/api/usuarios/${idAdmin1}/estado`, {
            method: 'PATCH',
            token: tokenUsuario,
            body: { activo: false },
          }),
          apiJson(`/api/usuarios/${idAdmin1}`, { method: 'DELETE', token: tokenUsuario }),
        ]);

        const codigos = respuestas.map((r) => r.status);
        if (codigos.some((c) => c !== 403)) {
          throw new Error(
            `Se esperaba 403 en todo /api/usuarios para usuario normal y se obtuvo: ${codigos.join('/')}`
          );
        }

        return `Indicador="${textoUsuario} · ${textoRol}", menú=oculto, Guard=dashboard, API=${codigos.join('/')}`;
      }
    );

    // =========================================================================
    // FLUJO (e): Responsividad y accesibilidad a 1440x900, 1280x800 y 390x844
    // =========================================================================
    await runFlow(
      'usuarios-e-responsive-capturas',
      'E2E-e: Escritorio (1440x900, 1280x800) y móvil (390x844) sin scroll horizontal y con chips ajustados',
      async () => {
        await loginViaUI(page, USERS.admin);

        await page.setViewportSize({ width: 1440, height: 900 });
        await irAUsuarios(page);
        const dims1440 = await verificarSinScrollHorizontal(page, 'Usuarios escritorio 1440x900');
        await page.screenshot({
          path: path.join(CAPTURAS_DIR, 'usuarios-escritorio-1440x900.png'),
          fullPage: true,
        });

        await page.setViewportSize({ width: 1280, height: 800 });
        const dims1280 = await verificarSinScrollHorizontal(page, 'Usuarios escritorio 1280x800');

        await page.setViewportSize({ width: 390, height: 844 });
        await irAUsuarios(page);
        const dimsMovilLista = await verificarSinScrollHorizontal(page, 'Usuarios móvil 390x844 (lista)');
        if (!(await page.locator('[data-sesion="indicador"]').isVisible())) {
          throw new Error('El indicador de sesión desapareció en móvil (390x844).');
        }

        // Comprobar que los distintivos de rol y estado en móvil no se estiran a todo el ancho de la celda
        const ajusteChips = await page.evaluate(() => {
          const chipRol = document.querySelector('table.es-table tbody [data-columna="rol"]');
          const celdaRol = chipRol?.closest('td');
          if (!chipRol || !celdaRol) return null;
          return {
            chipWidth: chipRol.getBoundingClientRect().width,
            tdWidth: celdaRol.getBoundingClientRect().width,
          };
        });
        if (!ajusteChips || ajusteChips.chipWidth > ajusteChips.tdWidth * 0.65) {
          throw new Error(
            `El distintivo de rol en móvil ocupa demasiado ancho: ${JSON.stringify(ajusteChips)}`
          );
        }

        await page.screenshot({
          path: path.join(CAPTURAS_DIR, 'usuarios-movil-390x844.png'),
          fullPage: true,
        });

        await page.locator('button[data-accion="nuevo-usuario"]').click();
        await page.locator('#usuarioModal').waitFor({ state: 'visible', timeout: 5000 });
        const dimsMovilModal = await verificarSinScrollHorizontal(page, 'Usuarios móvil 390x844 (modal)');
        await page.screenshot({
          path: path.join(CAPTURAS_DIR, 'usuarios-modal-movil-390x844.png'),
          fullPage: true,
        });
        await limpiarModales(page);

        return `1440(${dims1440.scrollWidth}/${dims1440.clientWidth}), 1280(${dims1280.scrollWidth}/${dims1280.clientWidth}), 390-lista(${dimsMovilLista.scrollWidth}/${dimsMovilLista.clientWidth}, chip=${Math.round(ajusteChips.chipWidth)}px), 390-modal(${dimsMovilModal.scrollWidth}/${dimsMovilModal.clientWidth})`;
      }
    );

    // =========================================================================
    // FLUJO (f): Cambio real de la propia contraseña de un administrador
    // =========================================================================
    await runFlow(
      'usuarios-f-cambio-clave-propia',
      'E2E-f: Cambio real de contraseña propia cierra sesión con aviso informativo, sin errores de consola y permite login con la nueva clave',
      async () => {
        const { token: tokenAdminPrincipal } = await apiLogin(USERS.admin);
        const adminF = `admin_f_${SUFIJO}`;
        const claveInicialF = `Admin.F1.${SUFIJO}`;
        const claveNuevaF = `Admin.F2.${SUFIJO}`;

        const creadoF = await apiCrearUsuario(tokenAdminPrincipal, {
          nombre_usuario: adminF,
          contrasena: claveInicialF,
          id_rol: 1,
        });
        const idAdminF = Number(creadoF.id_usuario);

        const erroresConsola = [];
        const onConsole = (msg) => {
          if (msg.type() === 'error') {
            erroresConsola.push(`console.error: ${msg.text()}`);
          }
        };
        const onPageError = (err) => {
          erroresConsola.push(`pageerror: ${err.message}`);
        };
        page.on('console', onConsole);
        page.on('pageerror', onPageError);

        try {
          await loginViaUI(page, { usuario: adminF, clave: claveInicialF });
          await irAUsuarios(page);

          const filaPropiaF = await buscarUsuarioEnTabla(page, adminF);
          if ((await filaPropiaF.locator('[data-distintivo="sesion-actual"]').count()) !== 1) {
            throw new Error('No se mostró «Sesión actual» en la fila de la cuenta administradora de prueba.');
          }

          await filaPropiaF.locator('button[data-accion="editar-usuario"]').click();
          const modal = page.locator('#usuarioModal');
          await modal.waitFor({ state: 'visible', timeout: 5000 });
          await modal.locator('[data-aviso="cambio-clave-propia"]').waitFor({ state: 'visible', timeout: 3000 });

          await modal.locator('#contrasenaUsuarioModal').fill(claveNuevaF);
          await modal.locator('#confirmarContrasenaModal').fill(claveNuevaF);

          const [resPutClave] = await Promise.all([
            page.waitForResponse(
              (r) =>
                r.url().endsWith(`/api/usuarios/${idAdminF}`) &&
                r.request().method() === 'PUT'
            ),
            page.waitForURL('**/login?sesion=clave-cambiada', { timeout: 8000 }),
            modal.locator('button[data-accion="guardar-usuario"]').click(),
          ]);

          if (resPutClave.status() !== 200) {
            throw new Error(`PUT cambio de clave propia devolvió ${resPutClave.status()}`);
          }

          const avisoLogin = page.locator('#login-aviso');
          await avisoLogin.waitFor({ state: 'visible', timeout: 5000 });
          const textoAviso = (await avisoLogin.innerText()).trim();
          if (textoAviso !== 'Contraseña actualizada. Inicie sesión con la nueva.') {
            throw new Error(`Texto de aviso inesperado tras cambio de clave: "${textoAviso}"`);
          }

          if ((await page.locator('#login-error').count()) !== 0) {
            const textoErr = await page.locator('#login-error').innerText();
            throw new Error(`No debía mostrarse alerta de error/caducidad y apareció: "${textoErr}"`);
          }

          if ((await page.locator('.modal-backdrop').count()) !== 0) {
            throw new Error('Quedó un .modal-backdrop huérfano tras navegar al login.');
          }

          // Esperar a que venza cualquier temporizador de transición de Bootstrap (350 ms)
          await new Promise((resolve) => setTimeout(resolve, 400));
          if (erroresConsola.length > 0) {
            throw new Error(`Se detectaron errores en consola tras cambiar la clave: ${erroresConsola.join(' | ')}`);
          }

          // Iniciar sesión con la nueva contraseña en la misma pantalla de login
          await page.locator('#username').fill(adminF);
          await page.locator('#password').fill(claveNuevaF);
          await Promise.all([
            page.waitForURL('**/menu-principal/dashboard', { timeout: 10000 }),
            page.locator('button.login-submit').click(),
          ]);

          await page.locator('[data-sesion="indicador"]').waitFor({ state: 'visible', timeout: 5000 });
          const indUsuario = (await page.locator('[data-sesion="usuario"]').innerText()).trim();
          const indRol = (await page.locator('[data-sesion="rol"]').innerText()).trim();
          if (indUsuario !== adminF || indRol !== 'Administrador') {
            throw new Error(`Indicador tras login con clave nueva inesperado: "${indUsuario} · ${indRol}"`);
          }

          if (erroresConsola.length > 0) {
            throw new Error(`Se detectaron errores en consola durante el reingreso: ${erroresConsola.join(' | ')}`);
          }

          return `id=${idAdminF} clave cambiada -> aviso="${textoAviso}" -> 0 errores consola -> login nueva clave OK`;
        } finally {
          page.off('console', onConsole);
          page.off('pageerror', onPageError);
          await apiCambiarEstado(tokenAdminPrincipal, idAdminF, false).catch(() => {});
        }
      }
    );
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  const fallos = results.filter((r) => !r.ok);
  console.log('\n============================================================');
  console.log(`Resumen E2E Usuarios: ${results.length - fallos.length}/${results.length} flujos en OK`);
  for (const r of results) {
    console.log(` - [${r.ok ? 'OK' : 'FALLO'}] ${r.slug}: ${r.detail}`);
  }
  console.log('============================================================');
  if (fallos.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Error fatal ejecutando E2E de usuarios:', err);
  process.exitCode = 1;
});
