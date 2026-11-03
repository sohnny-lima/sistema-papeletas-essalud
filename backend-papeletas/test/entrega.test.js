const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { recreateDatabase, startServer, api, login, USERS, runPsql, DB_CONFIG } = require('./helpers');

describe('c001 A2, A8, P8, E2 y trazabilidad (esquema reconstruido)', () => {
    let server, client, admin, user;
    before(async () => {
        recreateDatabase();
        server = await startServer({ port: 3109, env: { AUDIT_ENABLED: 'true' } });
        client = api(server.baseUrl);
        admin = await login(server.baseUrl, USERS.admin.usuario, USERS.admin.clave);
        user = await login(server.baseUrl, USERS.user.usuario, USERS.user.clave);
    });
    after(async () => { if (server) await server.stop(); });

    it('c002 bcrypt 6 valida los hashes $2b$10$ existentes de ambos usuarios ficticios', async () => {
        const bcrypt = require('bcrypt');
        const filas = JSON.parse(runPsql(['-d', DB_CONFIG.database, '-t', '-A', '-c',
            'SELECT json_agg(u) FROM (SELECT nombre_usuario, contrasena FROM usuarios ORDER BY id_usuario) u;']));
        for (const usuario of Object.values(USERS)) {
            const fila = filas.find(f => f.nombre_usuario === usuario.usuario);
            assert.ok(fila, 'Existe el usuario ficticio');
            assert.match(fila.contrasena, /^\$2b\$10\$/);
            assert.equal(await bcrypt.compare(usuario.clave, fila.contrasena), true);
            assert.equal(await bcrypt.compare('clave-incorrecta', fila.contrasena), false);
        }
    });

    it('A2 usuario inexistente y clave errónea tienen la misma respuesta 401', async () => {
        const respuestas = [];
        for (const nombreUsuario of ['inexistente_c001', USERS.user.usuario]) {
            respuestas.push(await client.post('/api/auth/login', { body: { nombreUsuario, contrasena: 'clave-erronea-secreta' } }));
        }
        assert.equal(respuestas[0].status, 401);
        assert.equal(respuestas[1].status, 401);
        assert.deepEqual(respuestas[0].body, respuestas[1].body);
        assert.equal(respuestas[0].body.message, 'Usuario o contraseña incorrectos.');
    });

    const equipo = { cod_patrimonial: '74089991', descripcion: 'PRUEBA C001', marca: 'M', modelo: 'MO', serie: 'S' };
    const trabajador = { nombres: 'PEDRO', apellido_paterno: 'PRUEBA', apellido_materno: 'ENTREGA', numero_identificacion: '10009991' };
    const papeleta = { fecha: '2026-10-28', id_tipo_formulario: 3, id_trabajador_origen: 1, id_trabajador_destino: 2, id_lugar_origen: 1, id_lugar_destino: 2, equipmentIds: [1] };
    for (const rol of ['admin', 'user']) {
        for (const [recurso, campo, body] of [['equipos', 'id_equipo', equipo], ['trabajadores', 'id_trabajador', trabajador], ['papeletas', 'id_papeleta', papeleta]]) {
            it(`A8 ${rol} crea y edita ${recurso} (200); solo admin elimina`, async () => {
                const token = rol === 'admin' ? admin : user;
                const created = await client.post(`/api/${recurso}`, { token, body });
                assert.equal(created.status, 200, created.text);
                const id = created.body.data[campo];
                const updated = await client.put(`/api/${recurso}/${id}`, { token, body });
                assert.equal(updated.status, 200, updated.text);
                const deleted = await client.delete(`/api/${recurso}/${id}`, { token });
                assert.equal(deleted.status, rol === 'admin' ? 200 : 403, deleted.text);
                if (rol === 'user') assert.equal((await client.delete(`/api/${recurso}/${id}`, { token: admin })).status, 200);
            });
        }
    }

    it('A8 eliminar equipo o trabajador en uso devuelve 409 explicativo', async () => {
        for (const recurso of ['equipos', 'trabajadores']) {
            const res = await client.delete(`/api/${recurso}/1`, { token: admin });
            assert.equal(res.status, 409);
            assert.match(res.body.message, /uso|relacionad/i);
        }
    });

    it('P8 listado y detalle conservan nombres compuestos y añaden ambiente/dependencia separados', async () => {
        const detalle = await client.get('/api/papeletas/1', { token: user });
        const lista = await client.get('/api/papeletas', { token: user });
        for (const p of [detalle.body.data, lista.body.data.data.find(p => p.id_papeleta === 1)]) {
            assert.equal(p.lugar_origen_nombre, 'OFICINA 101 (ADMINISTRACION)');
            assert.equal(p.lugar_origen_ambiente, 'OFICINA 101');
            assert.equal(p.lugar_origen_dependencia, 'ADMINISTRACION');
            assert.equal(p.lugar_destino_ambiente, 'ALMACEN CENTRAL');
            assert.equal(p.lugar_destino_dependencia, 'LOGISTICA');
        }
    });

    it('E2 los tres endpoints devuelven fecha textual, número y ambos apellidos', async () => {
        for (const ruta of ['', '/filtro?trabajador=UNO', '/1']) {
            const res = await client.get('/api/registro_movimientos' + ruta, { token: user });
            assert.equal(res.status, 200);
            const p = Array.isArray(res.body.data) ? res.body.data[0] : res.body.data;
            assert.match(p.fecha, /^\d{4}-\d{2}-\d{2}$/);
            assert.equal(p.numero_papeleta, 'PA-0001');
            assert.equal(p.trabajador_origen, 'ANA PRUEBA UNO');
            assert.equal(p.trabajador_destino, 'LUIS PRUEBA DOS');
        }
        const destino = await client.get('/api/registro_movimientos/filtro?trabajador=DOS', { token: user });
        assert.equal(destino.body.data.length, 1);
    });

    it('E2 orden estable por fecha descendente y luego número descendente', async () => {
        runPsql(['-d', DB_CONFIG.database, '-c', "INSERT INTO papeletas(numero_papeleta,fecha) VALUES ('PA-0099','2026-01-01'),('PA-0098','2026-01-01'),('PA-0100','2025-01-01');"]);
        for (const ruta of ['', '/filtro?fechaFin=2026-01-01']) {
            const res = await client.get('/api/registro_movimientos' + ruta, { token: user });
            assert.equal(res.status, 200);
            const filas = res.body.data.filter(p => ['PA-0099', 'PA-0098', 'PA-0100'].includes(p.numero_papeleta));
            assert.deepEqual(filas.map(p => p.numero_papeleta), ['PA-0099', 'PA-0098', 'PA-0100']);
        }
    });

    for (const filtro of ['fechaInicio=2026-02-30', 'fechaFin=ayer', 'fechaInicio=2026-10-28T00:00:00Z', 'fechaInicio=', 'fechaFin=2026-1-01', 'fechaInicio=x&fechaInicio=y']) {
        it(`E2 filtro inválido ${filtro} responde 400`, async () => {
            assert.equal((await client.get('/api/registro_movimientos/filtro?' + filtro, { token: user })).status, 400);
        });
    }
    for (const id of ['abc', '0', '-1', '1.5', '99999999999999']) {
        it(`E2 id inválido ${id} responde 400`, async () => {
            assert.equal((await client.get('/api/registro_movimientos/' + id, { token: user })).status, 400);
        });
    }
    it('E2 id inexistente responde 404', async () => {
        assert.equal((await client.get('/api/registro_movimientos/2147483647', { token: user })).status, 404);
    });

    it('Trazabilidad identifica también altas de catálogos y asociaciones', async () => {
        for (const [recurso, campo, body] of [
            ['estados_papeletas', 'id_estado', { nombre_estado: 'ESTADO C001' }],
            ['tipo_formulario', 'id_tipo_formulario', { nombre: 'TIPO C001' }],
            ['papeleta_equipos', 'id', { id_papeleta: 1, id_equipo: 3 }],
        ]) {
            const res = await client.post('/api/' + recurso, { token: admin, body });
            assert.equal(res.status, 200, res.text);
            let e;
            const limite = Date.now() + 2000;
            while (!e && Date.now() < limite) {
                e = server.proc.stdoutLog.split(/\r?\n/).filter(line => line.startsWith('{')).map(JSON.parse)
                    .findLast(e => e.evento === 'auditoria' && e.ruta === '/api/' + recurso + '/');
                if (!e) await new Promise(resolve => setTimeout(resolve, 20));
            }
            assert.ok(e, 'Falta el evento de alta de ' + recurso);
            assert.equal(e.idAfectado, res.body.data[campo]);
        }
    });

    it('Trazabilidad excluye secretos en query string y campos extra del cuerpo', async () => {
        const res = await client.post('/api/equipos?token=secreto-query-c001', {
            token: user, body: { ...equipo, cod_patrimonial: '74089992', datoPrivado: 'secreto-cuerpo-c001' }
        });
        assert.equal(res.status, 200, res.text);
    });

    it('Trazabilidad se puede silenciar y no interviene en GET', () => {
        const { auditWrites } = require('../middlewares/auditMiddleware');
        const previo = process.env.AUDIT_ENABLED;
        let llamadas = 0;
        try {
            process.env.AUDIT_ENABLED = 'false';
            auditWrites({ method: 'POST' }, null, () => llamadas++);
            process.env.AUDIT_ENABLED = 'true';
            auditWrites({ method: 'GET' }, null, () => llamadas++);
            assert.equal(llamadas, 2);
        } finally {
            if (previo === undefined) delete process.env.AUDIT_ENABLED;
            else process.env.AUDIT_ENABLED = previo;
        }
    });

    it('Trazabilidad g008 PATCH con sendStatus conserva ruta e id al terminar sin res.json', async (t) => {
        const express = require('express');
        const { auditWrites } = require('../middlewares/auditMiddleware');
        const eventos = [];
        t.mock.method(console, 'log', linea => eventos.push(JSON.parse(linea)));
        const app = express();
        const router = express.Router();
        app.use(auditWrites);
        router.patch('/:id', (_req, res) => res.sendStatus(204));
        app.use('/api/prueba-auditoria', router);
        const http = app.listen(3108, '127.0.0.1');
        try {
            const respuesta = await fetch('http://127.0.0.1:3108/api/prueba-auditoria/42?secreto=no-registrar', { method: 'PATCH' });
            assert.equal(respuesta.status, 204);
            assert.equal(eventos.length, 1);
            assert.equal(eventos[0].metodo, 'PATCH');
            assert.equal(eventos[0].ruta, '/api/prueba-auditoria/:id');
            assert.equal(eventos[0].idAfectado, 42);
            assert.equal(eventos[0].codigoRespuesta, 204);
        } finally {
            await new Promise((resolve, reject) => http.close(err => err ? reject(err) : resolve()));
        }
    });

    it('Trazabilidad JSON en stdout para POST/PUT/DELETE, fallos y login, sin secretos', async () => {
        // El último GET garantiza que el hijo haya escrito los eventos anteriores.
        await new Promise(resolve => setTimeout(resolve, 50));
        const logs = server.proc.stdoutLog;
        // VM1 añade eventos de acceso al mismo stdout; el contrato de auditoría sigue íntegro.
        const eventos = logs.split(/\r?\n/).filter(line => line.startsWith('{')).map(line => JSON.parse(line))
            .filter(evento => evento.evento === 'auditoria');
        assert.ok(eventos.length > 10);
        for (const e of eventos) {
            assert.deepEqual(Object.keys(e).sort(), ['evento','fecha','idUsuario','rol','metodo','ruta','idAfectado','codigoRespuesta','duracionMs'].sort());
            assert.equal(e.evento, 'auditoria');
            assert.equal(new Date(e.fecha).toISOString(), e.fecha);
            assert.ok(e.duracionMs >= 0 && Number.isFinite(e.duracionMs));
            assert.ok(['POST', 'PUT', 'DELETE'].includes(e.metodo));
        }
        for (const metodo of ['POST', 'PUT', 'DELETE']) assert.ok(eventos.some(e => e.metodo === metodo && e.rol === 'user' && e.idUsuario === 2));
        assert.ok(eventos.some(e => e.ruta === '/api/equipos/:id' && e.metodo === 'DELETE' && e.idAfectado === 1 && e.codigoRespuesta === 409 && e.rol === 'admin'));
        assert.ok(eventos.some(e => e.codigoRespuesta === 403));
        assert.ok(eventos.some(e => e.ruta === '/api/auth/login' && e.codigoRespuesta === 401 && e.idUsuario === null));
        for (const secreto of [user, admin, server.jwtSecret, USERS.admin.clave, USERS.user.clave, 'clave-erronea-secreta', 'secreto-query-c001', 'secreto-cuerpo-c001', 'datoPrivado', 'contrasena', 'Authorization', 'equipmentIds']) assert.ok(!logs.includes(secreto), secreto.slice(0, 10));
    });
});
