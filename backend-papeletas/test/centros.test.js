const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  recreateDatabase,
  startServer,
  api,
  login,
  USERS,
  DB_CONFIG,
  runPsql,
} = require('./helpers');

function sqlDirecto(sql) {
  return runPsql(['-d', DB_CONFIG.database, '-c', sql]);
}

describe('API de centros asistenciales (/api/centros_asistenciales)', () => {
  let server;
  let client;
  let adminToken;
  let userToken;

  before(async () => {
    recreateDatabase();
    server = await startServer({ port: 3108 });
    client = api(server.baseUrl);
    adminToken = await login(server.baseUrl, USERS.admin.usuario, USERS.admin.clave);
    userToken = await login(server.baseUrl, USERS.user.usuario, USERS.user.clave);
  });

  after(async () => {
    if (server) await server.stop();
  });

  describe('Autenticación y permisos por rol', () => {
    it('rechaza con 401 las peticiones sin token', async () => {
      const getRes = await client.get('/api/centros_asistenciales');
      assert.equal(getRes.status, 401);

      const postRes = await client.post('/api/centros_asistenciales', {
        body: { nombre_centro: 'CENTRO SIN TOKEN' },
      });
      assert.equal(postRes.status, 401);

      const putRes = await client.put('/api/centros_asistenciales/1', {
        body: { nombre_centro: 'CENTRO SIN TOKEN' },
      });
      assert.equal(putRes.status, 401);

      const delRes = await client.delete('/api/centros_asistenciales/1');
      assert.equal(delRes.status, 401);
    });

    it('permite GET al usuario normal (200) pero rechaza POST, PUT y DELETE con 403', async () => {
      const getRes = await client.get('/api/centros_asistenciales', { token: userToken });
      assert.equal(getRes.status, 200);
      assert.equal(getRes.body.success, true);

      const postRes = await client.post('/api/centros_asistenciales', {
        token: userToken,
        body: { nombre_centro: 'INTENTO USUARIO NORMAL' },
      });
      assert.equal(postRes.status, 403);
      assert.equal(postRes.body.success, false);

      const putRes = await client.put('/api/centros_asistenciales/1', {
        token: userToken,
        body: { nombre_centro: 'INTENTO EDITAR USUARIO' },
      });
      assert.equal(putRes.status, 403);
      assert.equal(putRes.body.success, false);

      const delRes = await client.delete('/api/centros_asistenciales/1', {
        token: userToken,
      });
      assert.equal(delRes.status, 403);
      assert.equal(delRes.body.success, false);
    });
  });

  describe('GET /api/centros_asistenciales', () => {
    it('devuelve lista ordenada por nombre_centro ASC con total_lugares como entero', async () => {
      // Crear un centro que alfabéticamente vaya primero para verificar el orden por nombre_centro ASC
      const createRes = await client.post('/api/centros_asistenciales', {
        token: adminToken,
        body: { nombre_centro: 'AAA CENTRO ALFABETICO PRIMERO' },
      });
      assert.equal(createRes.status, 200);

      const res = await client.get('/api/centros_asistenciales', { token: userToken });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length >= 2);

      for (const fila of res.body.data) {
        assert.equal(typeof fila.id_centro, 'number');
        assert.equal(typeof fila.nombre_centro, 'string');
        assert.equal(typeof fila.total_lugares, 'number');
        assert.ok(Number.isInteger(fila.total_lugares), 'total_lugares debe ser entero');
      }

      const nombres = res.body.data.map((c) => c.nombre_centro);
      const ordenados = [...nombres].sort((a, b) => a.localeCompare(b));
      assert.deepEqual(nombres, ordenados, 'Los centros deben venir ordenados por nombre_centro ASC');
    });
  });

  describe('POST /api/centros_asistenciales (creación, normalización y unicidad)', () => {
    it('normaliza espacios iniciales/finales, espacios repetidos y convierte a mayúsculas', async () => {
      const res = await client.post('/api/centros_asistenciales', {
        token: adminToken,
        body: { nombre_centro: '   policlinico   metropolitano\t\tsur   ' },
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.message, 'Centro asistencial creado exitosamente');
      assert.equal(typeof res.body.data.id_centro, 'number');
      assert.equal(res.body.data.nombre_centro, 'POLICLINICO METROPOLITANO SUR');
    });

    it('responde 400 cuando falta nombre_centro, no es texto, queda vacío o supera 200 caracteres', async () => {
      const casosInvalidos = [
        {},
        { nombre_centro: null },
        { nombre_centro: 12345 },
        { nombre_centro: ['HOSPITAL'] },
        { nombre_centro: '    \t\n   ' },
        { nombre_centro: 'A'.repeat(201) },
      ];

      for (const body of casosInvalidos) {
        const res = await client.post('/api/centros_asistenciales', {
          token: adminToken,
          body,
        });
        assert.equal(
          res.status,
          400,
          `Se esperaba 400 para ${JSON.stringify(body)} y devolvió ${res.status}`
        );
        assert.equal(res.body.success, false);
        assert.match(res.body.message, /nombre/i);
      }
    });

    it('responde 409 al intentar crear un duplicado con distintas mayúsculas o espacios e incluye id_centro existente', async () => {
      const lista = await client.get('/api/centros_asistenciales', { token: adminToken });
      const existente = lista.body.data.find(
        (c) => c.nombre_centro === 'HOSPITAL DE PRUEBA NORTE'
      );
      assert.ok(existente, 'Debe existir HOSPITAL DE PRUEBA NORTE en los datos semilla');

      const dup = await client.post('/api/centros_asistenciales', {
        token: adminToken,
        body: { nombre_centro: '  hospital   de\tprueba   norte  ' },
      });

      assert.equal(dup.status, 409);
      assert.equal(dup.body.success, false);
      assert.equal(
        dup.body.message,
        'Ya existe un centro asistencial llamado «HOSPITAL DE PRUEBA NORTE».'
      );
      assert.ok(dup.body.data);
      assert.equal(Number(dup.body.data.id_centro), Number(existente.id_centro));
    });
  });

  describe('PUT /api/centros_asistenciales/:id (edición, validación y unicidad)', () => {
    it('responde 400 si :id no es un entero positivo', async () => {
      for (const idInvalido of ['abc', '0', '-5', '1.5']) {
        const res = await client.put(`/api/centros_asistenciales/${idInvalido}`, {
          token: adminToken,
          body: { nombre_centro: 'NOMBRE VALIDO' },
        });
        assert.equal(
          res.status,
          400,
          `Se esperaba 400 para id=${idInvalido} y devolvió ${res.status}`
        );
        assert.equal(res.body.success, false);
      }
    });

    it('responde 400 si el nombre es inválido en PUT', async () => {
      for (const body of [{}, { nombre_centro: 999 }, { nombre_centro: '   ' }, { nombre_centro: 'X'.repeat(201) }]) {
        const res = await client.put('/api/centros_asistenciales/1', {
          token: adminToken,
          body,
        });
        assert.equal(res.status, 400);
        assert.equal(res.body.success, false);
        assert.match(res.body.message, /nombre/i);
      }
    });

    it('responde 404 si el centro asistencial no existe', async () => {
      const res = await client.put('/api/centros_asistenciales/999999', {
        token: adminToken,
        body: { nombre_centro: 'CENTRO INEXISTENTE' },
      });
      assert.equal(res.status, 404);
      assert.equal(res.body.success, false);
    });

    it('responde 409 si al editar choca con el nombre de otro centro existente', async () => {
      const c1 = await client.post('/api/centros_asistenciales', {
        token: adminToken,
        body: { nombre_centro: 'CENTRO EDITABLE ORIGEN' },
      });
      assert.equal(c1.status, 200);

      const lista = await client.get('/api/centros_asistenciales', { token: adminToken });
      const norte = lista.body.data.find((c) => c.nombre_centro === 'HOSPITAL DE PRUEBA NORTE');

      const conflict = await client.put(`/api/centros_asistenciales/${c1.body.data.id_centro}`, {
        token: adminToken,
        body: { nombre_centro: '   hospital  de   prueba norte ' },
      });

      assert.equal(conflict.status, 409);
      assert.equal(conflict.body.success, false);
      assert.equal(
        conflict.body.message,
        'Ya existe un centro asistencial llamado «HOSPITAL DE PRUEBA NORTE».'
      );
      assert.equal(Number(conflict.body.data.id_centro), Number(norte.id_centro));
    });

    it('permite renombrarse a sí mismo con distintas mayúsculas/espacios (200) y cambiar a un nombre nuevo normalizado', async () => {
      const creado = await client.post('/api/centros_asistenciales', {
        token: adminToken,
        body: { nombre_centro: 'CENTRO PROPIO RENOMBRABLE' },
      });
      assert.equal(creado.status, 200);
      const id = creado.body.data.id_centro;

      const mismoNombre = await client.put(`/api/centros_asistenciales/${id}`, {
        token: adminToken,
        body: { nombre_centro: '   centro   propio\trenombrable  ' },
      });
      assert.equal(mismoNombre.status, 200);
      assert.equal(mismoNombre.body.success, true);
      assert.equal(mismoNombre.body.data.nombre_centro, 'CENTRO PROPIO RENOMBRABLE');

      const nuevoNombre = await client.put(`/api/centros_asistenciales/${id}`, {
        token: adminToken,
        body: { nombre_centro: '  centro   propio   actualizado  ' },
      });
      assert.equal(nuevoNombre.status, 200);
      assert.equal(nuevoNombre.body.success, true);
      assert.equal(nuevoNombre.body.data.nombre_centro, 'CENTRO PROPIO ACTUALIZADO');
    });
  });

  describe('Concurrencia y restricción SQL (migración 002)', () => {
    it('dos POST simultáneos con el mismo nombre en distinta grafía producen exactamente un 200 y un 409', async () => {
      const [resA, resB] = await Promise.all([
        client.post('/api/centros_asistenciales', {
          token: adminToken,
          body: { nombre_centro: '  centro   concurrente   simultaneo  ' },
        }),
        client.post('/api/centros_asistenciales', {
          token: adminToken,
          body: { nombre_centro: 'CENTRO CONCURRENTE\tSIMULTANEO' },
        }),
      ]);

      const statuses = [resA.status, resB.status].sort((a, b) => a - b);
      assert.deepEqual(
        statuses,
        [200, 409],
        `Se esperaba [200, 409] y se obtuvo [${resA.status}, ${resB.status}]`
      );

      const okRes = resA.status === 200 ? resA : resB;
      const conflictRes = resA.status === 409 ? resA : resB;

      assert.equal(okRes.body.data.nombre_centro, 'CENTRO CONCURRENTE SIMULTANEO');
      assert.equal(
        conflictRes.body.message,
        'Ya existe un centro asistencial llamado «CENTRO CONCURRENTE SIMULTANEO».'
      );
      assert.equal(Number(conflictRes.body.data.id_centro), Number(okRes.body.data.id_centro));
    });

    it('migración 002: un INSERT SQL directo duplicado con otra grafía/espacios falla por índice único', () => {
      assert.throws(
        () => {
          sqlDirecto(
            "INSERT INTO centros_asistenciales (nombre_centro) VALUES ('  hospital   de prueba norte ');"
          );
        },
        /unique|duplicate|duplicad/i,
        'El INSERT SQL directo duplicado debe fallar por el índice único de la migración 002'
      );
    });
  });

  describe('Integración con Lugares y Papeletas', () => {
    it('permite crear un lugar con el centro nuevo, lo refleja en GET /api/lugares y crea una papeleta con ese lugar', async () => {
      const centroRes = await client.post('/api/centros_asistenciales', {
        token: adminToken,
        body: { nombre_centro: '  hospital   integracion   papeletas  ' },
      });
      assert.equal(centroRes.status, 200);
      const nuevoCentro = centroRes.body.data;
      assert.equal(nuevoCentro.nombre_centro, 'HOSPITAL INTEGRACION PAPELETAS');

      // Corrección de Claude: crear lugares es solo de administradores (lugaresRoutes.js, verifyAdmin);
      // el diseño original usaba userToken y fallaba por permisos, no por lo que se comprueba.
      const lugarRes = await client.post('/api/lugares', {
        token: adminToken,
        body: {
          nombre_ambiente: 'CONSULTORIO EXTERNO 205',
          dependencia: 'MEDICINA GENERAL',
          id_centro: nuevoCentro.id_centro,
        },
      });
      assert.equal(lugarRes.status, 200);
      const idLugarNuevo = lugarRes.body.data.id_lugar;

      const lugaresList = await client.get('/api/lugares?page=1&limit=50', { token: userToken });
      assert.equal(lugaresList.status, 200);
      const lugarEncontrado = lugaresList.body.data.data.find(
        (l) => Number(l.id_lugar) === Number(idLugarNuevo)
      );
      assert.ok(lugarEncontrado, 'El lugar creado debe aparecer en GET /api/lugares');
      assert.equal(lugarEncontrado.centro, 'HOSPITAL INTEGRACION PAPELETAS');

      const centrosList = await client.get('/api/centros_asistenciales', { token: userToken });
      const centroConLugar = centrosList.body.data.find(
        (c) => Number(c.id_centro) === Number(nuevoCentro.id_centro)
      );
      assert.ok(centroConLugar);
      assert.equal(centroConLugar.total_lugares, 1);

      const papeletaRes = await client.post('/api/papeletas', {
        token: userToken,
        body: {
          id_tipo_formulario: 3,
          id_trabajador_origen: 1,
          id_trabajador_destino: 2,
          id_lugar_origen: 1,
          id_lugar_destino: idLugarNuevo,
          fecha: '2026-10-27',
          equipmentIds: [1],
        },
      });
      assert.equal(papeletaRes.status, 200);
      assert.equal(papeletaRes.body.success, true);
      assert.match(papeletaRes.body.data.numero_papeleta, /^PA-\d{4}$/);
    });
  });
});
