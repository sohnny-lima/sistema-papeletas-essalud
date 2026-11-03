const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  USERS,
  recreateDatabase,
  resetSchemaAndData,
  startServer,
  api,
  login,
} = require('./helpers');

describe('Regresión de la API — sistema-papeletas-essalud', () => {
  let server;
  let client;
  let adminToken;
  let userToken;

  async function refreshStateAndTokens() {
    resetSchemaAndData();
    adminToken = await login(server.baseUrl, USERS.admin.usuario, USERS.admin.clave);
    userToken = await login(server.baseUrl, USERS.user.usuario, USERS.user.clave);
  }

  before(async () => {
    recreateDatabase();
    server = await startServer({ port: 3100 });
    client = api(server.baseUrl);
    adminToken = await login(server.baseUrl, USERS.admin.usuario, USERS.admin.clave);
    userToken = await login(server.baseUrl, USERS.user.usuario, USERS.user.clave);
  });

  after(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('Línea base: autenticación, permisos, CRUD básico, búsquedas y CORS', () => {
    before(async () => {
      await refreshStateAndTokens();
    });

    it('responde en GET / y aplica CORS para http://localhost:4200', async () => {
      const res = await client('GET', '/', {
        headers: { Origin: 'http://localhost:4200' },
      });
      assert.equal(res.status, 200);
      assert.equal(
        res.headers.get('access-control-allow-origin'),
        'http://localhost:4200'
      );
    });

    it('permite login de administrador y de usuario normal y rechaza credenciales inválidas con 401', async () => {
      const resAdmin = await client('POST', '/api/auth/login', {
        body: {
          nombreUsuario: USERS.admin.usuario,
          contrasena: USERS.admin.clave,
        },
      });
      assert.equal(resAdmin.status, 200);
      assert.equal(resAdmin.body.success, true);
      assert.equal(resAdmin.body.user.rol, 'admin');
      assert.equal(typeof resAdmin.body.token, 'string');

      const resUser = await client('POST', '/api/auth/login', {
        body: {
          nombreUsuario: USERS.user.usuario,
          contrasena: USERS.user.clave,
        },
      });
      assert.equal(resUser.status, 200);
      assert.equal(resUser.body.success, true);
      assert.equal(resUser.body.user.rol, 'user');
      assert.equal(typeof resUser.body.token, 'string');

      const resNoUser = await client('POST', '/api/auth/login', {
        body: { nombreUsuario: 'usuario_inexistente', contrasena: 'x' },
      });
      assert.equal(resNoUser.status, 401);
      assert.equal(resNoUser.body.success, false);

      const resBadPass = await client('POST', '/api/auth/login', {
        body: { nombreUsuario: USERS.admin.usuario, contrasena: 'clave_erronea' },
      });
      assert.equal(resBadPass.status, 401);
      assert.equal(resBadPass.body.success, false);
    });

    it('rechaza con 401 peticiones sin token o con token inválido', async () => {
      const noToken = await client('GET', '/api/equipos');
      assert.equal(noToken.status, 401);
      assert.equal(noToken.body.success, false);

      const badToken = await client('GET', '/api/equipos', {
        token: 'token.invalido.xyz',
      });
      assert.equal(badToken.status, 401);
      assert.equal(badToken.body.success, false);
    });

    it('devuelve estadísticas generales en GET /api/estadisticas', async () => {
      const res = await client('GET', '/api/estadisticas', { token: userToken });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.deepEqual(res.body.data, {
        trabajadores: 3,
        equipos: 3,
        papeletas: 1,
      });
    });

    it('bloquea con 403 al usuario normal al intentar eliminar papeletas, equipos, trabajadores o lugares', async () => {
      const delPapeleta = await client('DELETE', '/api/papeletas/1', {
        token: userToken,
      });
      assert.equal(delPapeleta.status, 403);

      const delEquipo = await client('DELETE', '/api/equipos/3', {
        token: userToken,
      });
      assert.equal(delEquipo.status, 403);

      const delTrabajador = await client('DELETE', '/api/trabajadores/3', {
        token: userToken,
      });
      assert.equal(delTrabajador.status, 403);

      const delLugar = await client('DELETE', '/api/lugares/3', {
        token: userToken,
      });
      assert.equal(delLugar.status, 403);
    });

    it('mantiene permisos y validaciones de equipos y trabajadores (DNI 8-12 dígitos, cód. patrimonial 4-20 dígitos)', async () => {
      // Código patrimonial inválido (< 4 dígitos o no numérico)
      const badEquipo = await client('POST', '/api/equipos', {
        token: userToken,
        body: {
          cod_patrimonial: '12A',
          descripcion: 'EQUIPO INVALIDO',
          marca: 'HP',
          serie: 'S1',
          modelo: 'M1',
        },
      });
      assert.equal(badEquipo.status, 400);

      // Usuario normal crea y edita equipo válido
      const createdEquipo = await client('POST', '/api/equipos', {
        token: userToken,
        body: {
          cod_patrimonial: '74089001',
          descripcion: 'LAPTOP PRUEBA',
          marca: 'DELL',
          serie: 'DL-01',
          modelo: 'LATITUDE',
        },
      });
      assert.equal(createdEquipo.status, 200);
      assert.equal(createdEquipo.body.success, true);
      const idEquipo = createdEquipo.body.data.id_equipo;

      // Código patrimonial duplicado -> 409
      const dupEquipo = await client('POST', '/api/equipos', {
        token: userToken,
        body: {
          cod_patrimonial: '74089001',
          descripcion: 'OTRA LAPTOP',
          marca: 'DELL',
          serie: 'DL-02',
          modelo: 'LATITUDE',
        },
      });
      assert.equal(dupEquipo.status, 409);

      const updatedEquipo = await client('PUT', `/api/equipos/${idEquipo}`, {
        token: userToken,
        body: {
          cod_patrimonial: '74089001',
          descripcion: 'LAPTOP PRUEBA ACTUALIZADA',
          marca: 'DELL',
          serie: 'DL-01',
          modelo: 'LATITUDE',
        },
      });
      assert.equal(updatedEquipo.status, 200);
      assert.equal(updatedEquipo.body.data.descripcion, 'LAPTOP PRUEBA ACTUALIZADA');

      // Admin puede eliminar el equipo creado
      const deletedEquipo = await client('DELETE', `/api/equipos/${idEquipo}`, {
        token: adminToken,
      });
      assert.equal(deletedEquipo.status, 200);

      // DNI inválido (letras o longitud fuera de 8-12)
      const badTrabajador = await client('POST', '/api/trabajadores', {
        token: userToken,
        body: {
          nombres: 'PEDRO',
          apellido_paterno: 'GOMEZ',
          apellido_materno: 'DIAZ',
          numero_identificacion: '1234567A',
        },
      });
      assert.equal(badTrabajador.status, 400);

      // Usuario normal crea y edita trabajador válido
      const createdTrab = await client('POST', '/api/trabajadores', {
        token: userToken,
        body: {
          nombres: 'PEDRO',
          apellido_paterno: 'GOMEZ',
          apellido_materno: 'DIAZ',
          numero_identificacion: '45678901',
        },
      });
      assert.equal(createdTrab.status, 200);
      const idTrab = createdTrab.body.data.id_trabajador;

      // DNI duplicado -> 409
      const dupTrab = await client('POST', '/api/trabajadores', {
        token: userToken,
        body: {
          nombres: 'OTRO',
          apellido_paterno: 'GOMEZ',
          apellido_materno: 'DIAZ',
          numero_identificacion: '45678901',
        },
      });
      assert.equal(dupTrab.status, 409);

      const updatedTrab = await client('PUT', `/api/trabajadores/${idTrab}`, {
        token: userToken,
        body: {
          nombres: 'PEDRO PABLO',
          apellido_paterno: 'GOMEZ',
          apellido_materno: 'DIAZ',
          numero_identificacion: '45678901',
        },
      });
      assert.equal(updatedTrab.status, 200);
      assert.equal(updatedTrab.body.data.nombres, 'PEDRO PABLO');

      const deletedTrab = await client('DELETE', `/api/trabajadores/${idTrab}`, {
        token: adminToken,
      });
      assert.equal(deletedTrab.status, 200);
    });

    it('ejecuta búsquedas de trabajadores, equipos, lugares y catálogo de tipos de formulario', async () => {
      const shortTrab = await client(
        'GET',
        '/api/papeletas/trabajadores/buscar?search=AN',
        { token: userToken }
      );
      assert.equal(shortTrab.status, 200);
      assert.deepEqual(shortTrab.body.data, []);

      const searchTrab = await client(
        'GET',
        '/api/papeletas/trabajadores/buscar?search=ANA',
        { token: userToken }
      );
      assert.equal(searchTrab.status, 200);
      assert.equal(searchTrab.body.data.length, 1);
      assert.equal(searchTrab.body.data[0].nombres, 'ANA');

      const searchEquipos = await client(
        'GET',
        '/api/papeletas/search/equipos?search=7408',
        { token: userToken }
      );
      assert.equal(searchEquipos.status, 200);
      assert.equal(searchEquipos.body.data.length, 3);

      const searchLugares = await client(
        'GET',
        '/api/lugares/search?searchText=OFICINA',
        { token: userToken }
      );
      assert.equal(searchLugares.status, 200);
      assert.equal(searchLugares.body.data.length, 1);
      assert.equal(searchLugares.body.data[0].nombre_ambiente, 'OFICINA 101');

      const tipos = await client('GET', '/api/papeletas/tipos/formulario', {
        token: userToken,
      });
      assert.equal(tipos.status, 200);
      assert.equal(tipos.body.data.length, 5);
    });
  });

  describe('P1 numeración', () => {
    before(async () => {
      await refreshStateAndTokens();
    });

    it('crea una papeleta con formato PA-NNNN correlativo, la devuelve en POST y avanza last/number', async () => {
      const beforeLast = await client('GET', '/api/papeletas/last/number', {
        token: userToken,
      });
      assert.equal(beforeLast.status, 200);
      assert.equal(Number(beforeLast.body.data.last_number), 1);

      const created = await client('POST', '/api/papeletas', {
        token: userToken,
        body: {
          id_tipo_formulario: 3,
          id_trabajador_origen: 1,
          id_trabajador_destino: 2,
          id_lugar_origen: 1,
          id_lugar_destino: 2,
          fecha: '2026-10-27',
          equipmentIds: [1, 2],
        },
      });

      assert.equal(created.status, 200);
      assert.equal(created.body.success, true);
      assert.ok(Number.isInteger(created.body.data?.id_papeleta));
      assert.equal(created.body.data?.numero_papeleta, 'PA-0002');

      const detail = await client(
        'GET',
        `/api/papeletas/${created.body.data.id_papeleta}`,
        { token: userToken }
      );
      assert.equal(detail.status, 200);
      assert.equal(detail.body.data.numero_papeleta, 'PA-0002');

      const afterLast = await client('GET', '/api/papeletas/last/number', {
        token: userToken,
      });
      assert.equal(afterLast.status, 200);
      assert.equal(Number(afterLast.body.data.last_number), 2);
    });

    it('ignora cualquier numero_papeleta enviado por el cliente en POST y asigna el correlativo del servidor', async () => {
      await refreshStateAndTokens();

      const created = await client('POST', '/api/papeletas', {
        token: userToken,
        body: {
          numero_papeleta: 'PA-9999',
          id_tipo_formulario: '3',
          id_trabajador_origen: 1,
          id_trabajador_destino: 2,
          id_lugar_origen: 1,
          id_lugar_destino: 2,
          fecha: '2026-10-27',
          equipmentIds: [1],
        },
      });

      assert.equal(created.status, 200);
      assert.equal(created.body.data?.numero_papeleta, 'PA-0002');
    });

    it('genera 20 números distintos y consecutivos (PA-NNNN) ante 20 creaciones simultáneas', async () => {
      await refreshStateAndTokens();

      const payload = {
        id_tipo_formulario: 3,
        id_trabajador_origen: 1,
        id_trabajador_destino: 2,
        id_lugar_origen: 1,
        id_lugar_destino: 2,
        fecha: '2026-10-27',
        equipmentIds: [1],
      };

      const responses = await Promise.all(
        Array.from({ length: 20 }, () =>
          client('POST', '/api/papeletas', { token: userToken, body: payload })
        )
      );

      for (const res of responses) {
        assert.equal(res.status, 200, `Se esperaba 200 pero llegó ${res.status}: ${JSON.stringify(res.body)}`);
        assert.equal(res.body.success, true);
        assert.match(String(res.body.data?.numero_papeleta), /^PA-\d{4}$/);
      }

      const numeros = responses
        .map((r) => r.body.data.numero_papeleta)
        .sort();
      const unicos = new Set(numeros);
      assert.equal(unicos.size, 20, 'Los 20 números generados deben ser únicos');

      const esperados = Array.from(
        { length: 20 },
        (_, idx) => `PA-${String(idx + 2).padStart(4, '0')}`
      );
      assert.deepEqual(numeros, esperados);

      const lastRes = await client('GET', '/api/papeletas/last/number', {
        token: userToken,
      });
      assert.equal(lastRes.status, 200);
      assert.equal(Number(lastRes.body.data.last_number), 21);
    });
  });

  describe('P2/P3 edición', () => {
    before(async () => {
      await refreshStateAndTokens();
    });

    it('incluye los IDs foráneos y fecha YYYY-MM-DD tanto en el listado como en el detalle', async () => {
      const listRes = await client('GET', '/api/papeletas', { token: userToken });
      assert.equal(listRes.status, 200);
      assert.equal(listRes.body.success, true);
      assert.ok(Array.isArray(listRes.body.data.data));
      assert.ok(listRes.body.data.data.length >= 1);

      const row = listRes.body.data.data.find((p) => p.id_papeleta === 1);
      assert.ok(row, 'Debe existir la papeleta 1 en el listado');
      assert.match(String(row.fecha), /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(Number(row.id_tipo_formulario), 3);
      assert.equal(Number(row.id_trabajador_origen), 1);
      assert.equal(Number(row.id_trabajador_destino), 2);
      assert.equal(Number(row.id_lugar_origen), 1);
      assert.equal(Number(row.id_lugar_destino), 2);

      const detRes = await client('GET', '/api/papeletas/1', { token: userToken });
      assert.equal(detRes.status, 200);
      assert.equal(detRes.body.success, true);
      const det = detRes.body.data;
      assert.match(String(det.fecha), /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(Number(det.id_tipo_formulario), 3);
      assert.equal(Number(det.id_trabajador_origen), 1);
      assert.equal(Number(det.id_trabajador_destino), 2);
      assert.equal(Number(det.id_lugar_origen), 1);
      assert.equal(Number(det.id_lugar_destino), 2);
    });

    it('permite PUT con los mismos datos del listado y persiste una fecha nueva al editar', async () => {
      const listRes = await client('GET', '/api/papeletas', { token: userToken });
      const row = listRes.body.data.data.find((p) => p.id_papeleta === 1);
      assert.ok(row);

      // PUT sin cambios usando los datos devueltos por el listado
      const samePut = await client('PUT', '/api/papeletas/1', {
        token: userToken,
        body: {
          id_tipo_formulario: row.id_tipo_formulario,
          id_trabajador_origen: row.id_trabajador_origen,
          id_trabajador_destino: row.id_trabajador_destino,
          id_lugar_origen: row.id_lugar_origen,
          id_lugar_destino: row.id_lugar_destino,
          fecha: row.fecha,
          equipmentIds: row.equipos_patrimoniales.map((e) => e.id_equipo),
        },
      });
      assert.equal(samePut.status, 200);
      assert.equal(samePut.body.success, true);

      // PUT cambiando fecha y equipos
      const nuevaFecha = '2026-05-15';
      const updateRes = await client('PUT', '/api/papeletas/1', {
        token: userToken,
        body: {
          id_tipo_formulario: 4,
          id_trabajador_origen: 2,
          id_trabajador_destino: 3,
          id_lugar_origen: 2,
          id_lugar_destino: 3,
          fecha: nuevaFecha,
          equipmentIds: [2, 3],
        },
      });
      assert.equal(updateRes.status, 200);
      assert.equal(updateRes.body.success, true);

      const detAfter = await client('GET', '/api/papeletas/1', {
        token: userToken,
      });
      assert.equal(detAfter.status, 200);
      assert.equal(detAfter.body.data.fecha, nuevaFecha);
      assert.equal(Number(detAfter.body.data.id_tipo_formulario), 4);
      assert.equal(Number(detAfter.body.data.id_trabajador_origen), 2);
      assert.equal(Number(detAfter.body.data.id_trabajador_destino), 3);
      assert.equal(Number(detAfter.body.data.id_lugar_origen), 2);
      assert.equal(Number(detAfter.body.data.id_lugar_destino), 3);
      assert.deepEqual(
        detAfter.body.data.equipos_patrimoniales
          .map((e) => e.id_equipo)
          .sort((a, b) => a - b),
        [2, 3]
      );
    });

    it('conserva la fecha existente en PUT cuando no se envía el campo fecha', async () => {
      const detBefore = await client('GET', '/api/papeletas/1', { token: userToken });
      assert.equal(detBefore.status, 200);
      const fechaPrevia = detBefore.body.data.fecha;

      const putNoFecha = await client('PUT', '/api/papeletas/1', {
        token: userToken,
        body: {
          id_tipo_formulario: 2,
          id_trabajador_origen: 1,
          id_trabajador_destino: 3,
          id_lugar_origen: 1,
          id_lugar_destino: 3,
          equipmentIds: [1],
        },
      });
      assert.equal(putNoFecha.status, 200);
      assert.equal(putNoFecha.body.data.fecha, fechaPrevia);

      const detAfter = await client('GET', '/api/papeletas/1', { token: userToken });
      assert.equal(detAfter.status, 200);
      assert.equal(detAfter.body.data.fecha, fechaPrevia);
    });
  });

  describe('P4 validación', () => {
    before(async () => {
      await refreshStateAndTokens();
    });

    const baseValida = {
      id_tipo_formulario: 3,
      id_trabajador_origen: 1,
      id_trabajador_destino: 2,
      id_lugar_origen: 1,
      id_lugar_destino: 2,
      fecha: '2026-10-27',
      equipmentIds: [1],
    };

    it('rechaza con 400 IDs no enteros o <= 0 al crear y al editar', async () => {
      const invalidPayloads = [
        { ...baseValida, id_tipo_formulario: -1 },
        { ...baseValida, id_trabajador_origen: 'abc' },
        { ...baseValida, id_trabajador_destino: 0 },
        { ...baseValida, id_lugar_origen: 1.5 },
        { ...baseValida, id_lugar_destino: -3 },
        { ...baseValida, equipmentIds: [0] },
        { ...baseValida, equipmentIds: ['no-num'] },
      ];

      for (const body of invalidPayloads) {
        const postRes = await client('POST', '/api/papeletas', {
          token: userToken,
          body,
        });
        assert.equal(postRes.status, 400, `POST debía dar 400 para ${JSON.stringify(body)}`);
        assert.equal(postRes.body.success, false);
        assert.equal(typeof postRes.body.message, 'string');

        const putRes = await client('PUT', '/api/papeletas/1', {
          token: userToken,
          body,
        });
        assert.equal(putRes.status, 400, `PUT debía dar 400 para ${JSON.stringify(body)}`);
        assert.equal(putRes.body.success, false);
        assert.equal(typeof putRes.body.message, 'string');
      }
    });

    it('rechaza con 400 (o 404) referencias inexistentes sin provocar error 500', async () => {
      const missingRefPayloads = [
        { ...baseValida, id_tipo_formulario: 9999 },
        { ...baseValida, id_trabajador_origen: 9999 },
        { ...baseValida, id_trabajador_destino: 9999 },
        { ...baseValida, id_lugar_origen: 9999 },
        { ...baseValida, id_lugar_destino: 9999 },
        { ...baseValida, equipmentIds: [9999] },
      ];

      for (const body of missingRefPayloads) {
        const postRes = await client('POST', '/api/papeletas', {
          token: userToken,
          body,
        });
        assert.ok(
          postRes.status === 400 || postRes.status === 404,
          `POST con FK inexistente debía dar 400/404 pero dio ${postRes.status}: ${JSON.stringify(body)}`
        );
        assert.equal(postRes.body.success, false);
        assert.ok(postRes.body.message);

        const putRes = await client('PUT', '/api/papeletas/1', {
          token: userToken,
          body,
        });
        assert.ok(
          putRes.status === 400 || putRes.status === 404,
          `PUT con FK inexistente debía dar 400/404 pero dio ${putRes.status}: ${JSON.stringify(body)}`
        );
        assert.equal(putRes.body.success, false);
        assert.ok(putRes.body.message);
      }
    });

    it('rechaza con 400 equipmentIds vacío o con duplicados al crear y al editar', async () => {
      for (const equipmentIds of [[], [3, 3]]) {
        const postRes = await client('POST', '/api/papeletas', {
          token: userToken,
          body: { ...baseValida, equipmentIds },
        });
        assert.equal(postRes.status, 400);
        assert.equal(postRes.body.success, false);

        const putRes = await client('PUT', '/api/papeletas/1', {
          token: userToken,
          body: { ...baseValida, equipmentIds },
        });
        assert.equal(putRes.status, 400);
        assert.equal(putRes.body.success, false);
      }
    });

    it('rechaza con 400 cuando trabajador origen = destino o lugar origen = destino', async () => {
      const sameTrabajador = {
        ...baseValida,
        id_trabajador_origen: 1,
        id_trabajador_destino: 1,
      };
      const sameLugar = {
        ...baseValida,
        id_lugar_origen: 2,
        id_lugar_destino: 2,
      };

      for (const body of [sameTrabajador, sameLugar]) {
        const postRes = await client('POST', '/api/papeletas', {
          token: userToken,
          body,
        });
        assert.equal(postRes.status, 400);
        assert.equal(postRes.body.success, false);

        const putRes = await client('PUT', '/api/papeletas/1', {
          token: userToken,
          body,
        });
        assert.equal(putRes.status, 400);
        assert.equal(putRes.body.success, false);
      }
    });

    it('rechaza con 400 fechas con formato o valor inválido al crear y al editar', async () => {
      for (const fecha of ['no-es-fecha', '2026-13-40', '2026-02-30', '']) {
        const postRes = await client('POST', '/api/papeletas', {
          token: userToken,
          body: { ...baseValida, fecha },
        });
        assert.equal(postRes.status, 400, `POST debía rechazar fecha=${fecha}`);
        assert.equal(postRes.body.success, false);

        const putRes = await client('PUT', '/api/papeletas/1', {
          token: userToken,
          body: { ...baseValida, fecha },
        });
        assert.equal(putRes.status, 400, `PUT debía rechazar fecha=${fecha}`);
        assert.equal(putRes.body.success, false);
      }
    });

    it('responde 404 para papeleta inexistente en GET, PUT y DELETE y 400 para :id no numérico', async () => {
      const get404 = await client('GET', '/api/papeletas/99999', {
        token: userToken,
      });
      assert.equal(get404.status, 404);
      assert.equal(get404.body.success, false);

      const put404 = await client('PUT', '/api/papeletas/99999', {
        token: userToken,
        body: baseValida,
      });
      assert.equal(put404.status, 404);
      assert.equal(put404.body.success, false);

      const del404 = await client('DELETE', '/api/papeletas/99999', {
        token: adminToken,
      });
      assert.equal(del404.status, 404);
      assert.equal(del404.body.success, false);

      const getBadId = await client('GET', '/api/papeletas/abc', {
        token: userToken,
      });
      assert.equal(getBadId.status, 400);
      assert.equal(getBadId.body.success, false);

      const putBadId = await client('PUT', '/api/papeletas/abc', {
        token: userToken,
        body: baseValida,
      });
      assert.equal(putBadId.status, 400);
      assert.equal(putBadId.body.success, false);

      const delBadId = await client('DELETE', '/api/papeletas/abc', {
        token: adminToken,
      });
      assert.equal(delBadId.status, 400);
      assert.equal(delBadId.body.success, false);
    });

    it('traduce errores de PostgreSQL en otros controladores (:id no numérico -> 400, borrar registro en uso -> 409)', async () => {
      const badEquipoId = await client('GET', '/api/equipos/abc', { token: userToken });
      assert.equal(badEquipoId.status, 400);
      assert.equal(badEquipoId.body.success, false);

      const badTrabId = await client('GET', '/api/trabajadores/abc', { token: userToken });
      assert.equal(badTrabId.status, 400);
      assert.equal(badTrabId.body.success, false);

      // Equipo 1, trabajador 1 y lugar 1 están referenciados por la papeleta 1
      const delEquipoEnUso = await client('DELETE', '/api/equipos/1', { token: adminToken });
      assert.equal(delEquipoEnUso.status, 409);
      assert.equal(delEquipoEnUso.body.success, false);

      const delTrabEnUso = await client('DELETE', '/api/trabajadores/1', { token: adminToken });
      assert.equal(delTrabEnUso.status, 409);
      assert.equal(delTrabEnUso.body.success, false);

      const delLugarEnUso = await client('DELETE', '/api/lugares/1', { token: adminToken });
      assert.equal(delLugarEnUso.status, 409);
      assert.equal(delLugarEnUso.body.success, false);
    });
  });

  describe('P7/E6 paginación', () => {
    before(async () => {
      await refreshStateAndTokens();
    });

    const endpoints = [
      '/api/papeletas',
      '/api/lugares',
      '/api/equipos',
      '/api/trabajadores',
    ];

    it('normaliza page=-1, page=abc, pageSize=-5 y pageSize=100000 devolviendo 200 en los 4 listados', async () => {
      const queries = [
        'page=-1',
        'page=abc',
        'pageSize=-5',
        'pageSize=100000',
        'page=-2&pageSize=-10',
      ];

      for (const ep of endpoints) {
        for (const q of queries) {
          const res = await client('GET', `${ep}?${q}`, { token: userToken });
          assert.equal(
            res.status,
            200,
            `${ep}?${q} debía responder 200 pero respondió ${res.status}`
          );
          assert.equal(res.body.success, true);
          assert.ok(Array.isArray(res.body.data?.data));
          assert.equal(typeof res.body.data?.totalItems, 'number');
          if (res.body.data.currentPage !== undefined) {
            assert.ok(res.body.data.currentPage >= 1);
          }
        }
      }
    });
  });

  describe('E1 movimientos', () => {
    before(async () => {
      await refreshStateAndTokens();
    });

    it('filtra movimientos por trabajador solo, lugar solo, fechas solas y combinaciones', async () => {
      const allRes = await client('GET', '/api/registro_movimientos', {
        token: userToken,
      });
      assert.equal(allRes.status, 200);
      assert.equal(allRes.body.success, true);
      assert.ok(Array.isArray(allRes.body.data));
      assert.ok(allRes.body.data.length >= 1);

      const byTrabajador = await client(
        'GET',
        '/api/registro_movimientos/filtro?trabajador=ANA',
        { token: userToken }
      );
      assert.equal(byTrabajador.status, 200);
      assert.equal(byTrabajador.body.success, true);
      assert.ok(Array.isArray(byTrabajador.body.data));
      assert.equal(byTrabajador.body.data.length, 1);

      const byLugar = await client(
        'GET',
        '/api/registro_movimientos/filtro?lugar=OFICINA',
        { token: userToken }
      );
      assert.equal(byLugar.status, 200);
      assert.equal(byLugar.body.success, true);
      assert.ok(Array.isArray(byLugar.body.data));
      assert.equal(byLugar.body.data.length, 1);

      const byFechas = await client(
        'GET',
        '/api/registro_movimientos/filtro?fechaInicio=2020-01-01&fechaFin=2030-12-31',
        { token: userToken }
      );
      assert.equal(byFechas.status, 200);
      assert.equal(byFechas.body.success, true);
      assert.equal(byFechas.body.data.length, 1);

      const combined = await client(
        'GET',
        '/api/registro_movimientos/filtro?fechaInicio=2020-01-01&fechaFin=2030-12-31&trabajador=ANA&lugar=OFICINA',
        { token: userToken }
      );
      assert.equal(combined.status, 200);
      assert.equal(combined.body.success, true);
      assert.equal(combined.body.data.length, 1);

      const noMatch = await client(
        'GET',
        '/api/registro_movimientos/filtro?trabajador=INEXISTENTE_ZZZ',
        { token: userToken }
      );
      assert.equal(noMatch.status, 200);
      assert.equal(noMatch.body.success, true);
      assert.deepEqual(noMatch.body.data, []);
    });

    it('filtra movimientos con fechaInicio sola, fechaFin sola y responde 400 ante fecha inválida', async () => {
      const soloInicio = await client(
        'GET',
        '/api/registro_movimientos/filtro?fechaInicio=2020-01-01',
        { token: userToken }
      );
      assert.equal(soloInicio.status, 200);
      assert.equal(soloInicio.body.data.length, 1);

      const soloFin = await client(
        'GET',
        '/api/registro_movimientos/filtro?fechaFin=2030-12-31',
        { token: userToken }
      );
      assert.equal(soloFin.status, 200);
      assert.equal(soloFin.body.data.length, 1);

      const fechaInvalida = await client(
        'GET',
        '/api/registro_movimientos/filtro?fechaInicio=fecha-invalida',
        { token: userToken }
      );
      assert.equal(fechaInvalida.status, 400);
      assert.equal(fechaInvalida.body.success, false);
    });
  });

  describe('E5 JSON mal formado', () => {
    it('responde 400 y sin stack ante un cuerpo JSON mal formado', async () => {
      const res = await client('POST', '/api/equipos', {
        token: userToken,
        rawBody: '{mal json',
      });
      assert.equal(res.status, 400);
      assert.equal(typeof res.body, 'object');
      assert.equal(res.body.success, false);
      assert.equal(typeof res.body.message, 'string');
      assert.equal(res.body.stack, undefined);
    });
  });
});
