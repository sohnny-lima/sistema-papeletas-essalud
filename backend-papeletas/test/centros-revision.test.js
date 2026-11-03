// Regresión de los hallazgos de /code-review sobre la gestión de centros asistenciales.
// Escritas por Claude (ver docs/revision/cambios-centros.md).
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { recreateDatabase, startServer, api, login, USERS, DB_CONFIG, runPsql } = require('./helpers');

function sqlPrueba(sql) {
  return runPsql(['-d', DB_CONFIG.database, '-At', '-c', sql]);
}

describe('Centros asistenciales: revisión de código', () => {
  let server;
  let client;
  let adminToken;

  before(async () => {
    recreateDatabase();
    server = await startServer({ port: 3109 });
    client = api(server.baseUrl);
    adminToken = await login(server.baseUrl, USERS.admin.usuario, USERS.admin.clave);
  });

  after(async () => {
    if (server) await server.stop();
  });

  it('un 23505 que no es del índice de nombres no se presenta como «nombre repetido»', async () => {
    // Desfasa la secuencia: el siguiente id ya existe (choque de clave primaria, también 23505)
    sqlPrueba("SELECT setval('centros_asistenciales_id_centro_seq', 1, false);");
    const res = await client.post('/api/centros_asistenciales', {
      token: adminToken,
      body: { nombre_centro: 'CENTRO CON SECUENCIA DESFASADA' },
    });
    assert.equal(res.status, 409);
    assert.notEqual(res.body.message, 'Ya existe un centro asistencial con ese nombre.');
    assert.doesNotMatch(res.body.message, /llamado/);
    // Restablece la secuencia para no afectar a otras pruebas
    sqlPrueba("SELECT setval('centros_asistenciales_id_centro_seq', (SELECT MAX(id_centro) FROM centros_asistenciales));");
  });

  it('migración 002: el índice une espacios antes de recortar (tabulador o salto de línea al inicio)', () => {
    assert.throws(
      () => sqlPrueba("INSERT INTO centros_asistenciales (nombre_centro) VALUES (E'\\thospital de prueba norte\\n');"),
      /unique|duplicate|duplicad/i
    );
  });

  it('la API trata un nombre con tabulador inicial como el mismo centro (409)', async () => {
    const res = await client.post('/api/centros_asistenciales', {
      token: adminToken,
      body: { nombre_centro: '\thospital de prueba norte\n' },
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.message, 'Ya existe un centro asistencial llamado «HOSPITAL DE PRUEBA NORTE».');
    assert.equal(typeof res.body.data.id_centro, 'number');
  });

  // Huecos señalados por Gemini en g006 (hallazgo 4)
  it('GET /:id: 200 con el centro, 400 con id no válido y 404 si no existe', async () => {
    const ok = await client.get('/api/centros_asistenciales/1', { token: adminToken });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.id_centro, 1);
    assert.equal(ok.body.data.nombre_centro, 'HOSPITAL DE PRUEBA NORTE');

    for (const id of ['abc', '0', '1.5']) {
      const res = await client.get(`/api/centros_asistenciales/${id}`, { token: adminToken });
      assert.equal(res.status, 400, `id=${id}`);
    }
    const noExiste = await client.get('/api/centros_asistenciales/999999', { token: adminToken });
    assert.equal(noExiste.status, 404);
  });

  it('DELETE /:id: 200 para un centro sin lugares, 400 con id no válido y 404 si no existe', async () => {
    const creado = await client.post('/api/centros_asistenciales', {
      token: adminToken,
      body: { nombre_centro: 'CENTRO SIN LUGARES PARA BORRAR' },
    });
    assert.equal(creado.status, 200);
    const id = creado.body.data.id_centro;

    const borrado = await client.delete(`/api/centros_asistenciales/${id}`, { token: adminToken });
    assert.equal(borrado.status, 200);
    assert.equal(borrado.body.success, true);

    const otraVez = await client.delete(`/api/centros_asistenciales/${id}`, { token: adminToken });
    assert.equal(otraVez.status, 404);

    const invalido = await client.delete('/api/centros_asistenciales/abc', { token: adminToken });
    assert.equal(invalido.status, 400);
  });

  // A8 (Lugares): el usuario normal consulta; crear, editar y eliminar siguen protegidos por el servidor
  it('A8 lugares: el usuario normal lista y busca (200) pero recibe 403 al crear, editar o eliminar, sin cambios en la base', async () => {
    const userToken = await login(server.baseUrl, USERS.user.usuario, USERS.user.clave);
    const antes = sqlPrueba("SELECT COUNT(*) || '|' || string_agg(id_lugar || ':' || nombre_ambiente, ',' ORDER BY id_lugar) FROM lugares;").trim();

    const lista = await client.get('/api/lugares?page=1&limit=10', { token: userToken });
    assert.equal(lista.status, 200);
    assert.ok(Array.isArray(lista.body.data.data));
    const busqueda = await client.get('/api/lugares/search?searchText=OFICINA', { token: userToken });
    assert.equal(busqueda.status, 200);

    const cuerpo = { nombre_ambiente: 'INTENTO USUARIO', dependencia: 'INTENTO USUARIO', id_centro: 1 };
    const crear = await client.post('/api/lugares', { token: userToken, body: cuerpo });
    const editar = await client.put('/api/lugares/1', { token: userToken, body: cuerpo });
    const eliminar = await client.delete('/api/lugares/1', { token: userToken });
    assert.equal(crear.status, 403);
    assert.equal(editar.status, 403);
    assert.equal(eliminar.status, 403);

    const despues = sqlPrueba("SELECT COUNT(*) || '|' || string_agg(id_lugar || ':' || nombre_ambiente, ',' ORDER BY id_lugar) FROM lugares;").trim();
    assert.equal(despues, antes);
  });

  it('un centro con lugares asociados no se puede eliminar por la API (409, sin borrar nada)', async () => {
    const res = await client.delete('/api/centros_asistenciales/1', { token: adminToken });
    assert.equal(res.status, 409);
    const total = sqlPrueba('SELECT COUNT(*) FROM centros_asistenciales WHERE id_centro = 1;').trim();
    assert.equal(total, '1');
  });
});
