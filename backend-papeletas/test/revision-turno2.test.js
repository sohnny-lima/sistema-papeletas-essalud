// Pruebas de los puntos detectados por Gemini en la revisión del turno 2
// (docs/revision/gemini/respuesta-turno-2.md). Escritas por Claude.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { recreateDatabase, startServer, api, login, USERS, DB_CONFIG, runPsql } = require('./helpers');

// SQL directo contra la base de pruebas (misma configuración que helpers.js: TEST_DB_*, PSQL).
function sqlPrueba(sql) {
  runPsql(['-d', DB_CONFIG.database, '-c', sql]);
}

describe('Revisión turno 2 (Gemini)', () => {
  let server;
  let client;
  let token;

  before(async () => {
    recreateDatabase();
    server = await startServer({ port: 3105 });
    client = api(server.baseUrl);
    token = await login(server.baseUrl, USERS.user.usuario, USERS.user.clave);
  });

  after(async () => {
    if (server) await server.stop();
  });

  it('category heredada del prototipo (toString) no genera SQL inválido', async () => {
    const res = await client('GET', '/api/papeletas?category=toString&filterText=PA', { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  it('parámetros repetidos en la URL responden (no se cuelga la petición)', { timeout: 20000 }, async () => {
    for (const path of [
      '/api/equipos?filterText=CPU&filterText=MON',
      '/api/trabajadores?filterText=ANA&filterText=LUIS',
      '/api/lugares/search?searchText=OFI&searchText=ALM',
      '/api/papeletas?filterText=PA&filterText=PB',
    ]) {
      const res = await client('GET', path, { token });
      assert.ok(res.status < 500, `${path} respondió ${res.status}`);
    }
  });

  it('login con contraseña no textual responde 400', async () => {
    const res = await client('POST', '/api/auth/login', {
      body: { nombreUsuario: USERS.user.usuario, contrasena: 12345 },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  it('una papeleta sin equipos devuelve equipos_patrimoniales = [] (no null)', async () => {
    // Simula una papeleta histórica sin equipos (antes el PUT lo permitía)
    sqlPrueba('DELETE FROM papeleta_equipos WHERE id_papeleta = 1;');

    const det = await client('GET', '/api/papeletas/1', { token });
    assert.equal(det.status, 200);
    assert.deepEqual(det.body.data.equipos_patrimoniales, []);

    const list = await client('GET', '/api/papeletas', { token });
    const row = list.body.data.data.find((p) => Number(p.id_papeleta) === 1);
    assert.deepEqual(row.equipos_patrimoniales, []);
  });

  it('un número histórico con 10+ dígitos no bloquea la numeración', async () => {
    sqlPrueba("INSERT INTO papeletas (numero_papeleta, fecha, id_tipo_formulario, id_trabajador_origen, id_trabajador_destino, id_lugar_origen, id_lugar_destino) VALUES ('PA-2025102701', CURRENT_DATE, 1, 1, 2, 1, 2);");

    const last = await client('GET', '/api/papeletas/last/number', { token });
    assert.equal(last.status, 200);
    assert.equal(Number(last.body.data.last_number), 1);

    const created = await client('POST', '/api/papeletas', {
      token,
      body: {
        id_tipo_formulario: 3, id_trabajador_origen: 1, id_trabajador_destino: 2,
        id_lugar_origen: 1, id_lugar_destino: 2, fecha: '2026-10-27', equipmentIds: [1],
      },
    });
    assert.equal(created.status, 200);
    assert.equal(created.body.data.numero_papeleta, 'PA-0002');
  });
});

describe('Revisión turno 3 (huecos señalados por Gemini)', () => {
  let server;
  let client;
  let adminToken;
  let userToken;

  before(async () => {
    recreateDatabase();
    server = await startServer({ port: 3107 });
    client = api(server.baseUrl);
    adminToken = await login(server.baseUrl, USERS.admin.usuario, USERS.admin.clave);
    userToken = await login(server.baseUrl, USERS.user.usuario, USERS.user.clave);
  });

  after(async () => {
    if (server) await server.stop();
  });

  it('texto más largo que la columna (22001) responde 400, no 500', async () => {
    const res = await client('POST', '/api/equipos', {
      token: userToken,
      body: { cod_patrimonial: '74081234', descripcion: 'X'.repeat(300), marca: 'M', serie: 'S', modelo: 'MO' },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  it('alta y edición de usuario con contraseña no textual responden 400', async () => {
    const created = await client('POST', '/api/usuarios', {
      token: adminToken,
      body: { nombre_usuario: 'tipo_invalido', contrasena: 12345, id_rol: 2 },
    });
    assert.equal(created.status, 400);
    const updated = await client('PUT', '/api/usuarios/2', {
      token: adminToken,
      body: { nombre_usuario: 'usuario_prueba', contrasena: ['x'], id_rol: 2 },
    });
    assert.equal(updated.status, 400);
  });

  it('PUT y DELETE simultáneos sobre la misma papeleta: sin 409 ni 500 y estado final coherente', async () => {
    for (let i = 0; i < 5; i++) {
      const created = await client('POST', '/api/papeletas', {
        token: userToken,
        body: {
          id_tipo_formulario: 3, id_trabajador_origen: 1, id_trabajador_destino: 2,
          id_lugar_origen: 1, id_lugar_destino: 2, fecha: '2026-10-27', equipmentIds: [1, 2],
        },
      });
      assert.equal(created.status, 200);
      const id = created.body.data.id_papeleta;

      const [put, del] = await Promise.all([
        client('PUT', `/api/papeletas/${id}`, {
          token: userToken,
          body: {
            id_tipo_formulario: 4, id_trabajador_origen: 2, id_trabajador_destino: 3,
            id_lugar_origen: 2, id_lugar_destino: 3, fecha: '2026-11-01', equipmentIds: [3],
          },
        }),
        client('DELETE', `/api/papeletas/${id}`, { token: adminToken }),
      ]);
      assert.ok([200, 404].includes(put.status), `PUT respondió ${put.status}: ${JSON.stringify(put.body)}`);
      assert.equal(del.status, 200, `DELETE respondió ${del.status}: ${JSON.stringify(del.body)}`);

      const after = await client('GET', `/api/papeletas/${id}`, { token: userToken });
      assert.equal(after.status, 404, 'La papeleta debe quedar eliminada');
    }
  });
});

describe('Revisión turno 2: login con la base de datos caída', () => {
  it('responde 503 en lugar de 500', async () => {
    const server = await startServer({ port: 3106, env: { DB_PORT: '55499' } });
    try {
      const res = await api(server.baseUrl)('POST', '/api/auth/login', {
        body: { nombreUsuario: USERS.user.usuario, contrasena: USERS.user.clave },
      });
      assert.equal(res.status, 503);
      assert.equal(res.body.success, false);
    } finally {
      await server.stop();
    }
  });
});
