// Pruebas de autorización para mutaciones de catálogos (hallazgo r007-3)
// Verifica que los usuarios sin rol de administrador reciban 403 en POST, PUT y DELETE
// en roles, estados_papeletas, tipo_formulario y papeleta_equipos, comprobando además
// que la base de datos no sufre alteraciones y que la lectura responde 200.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { recreateDatabase, startServer, api, login, USERS } = require('./helpers');

describe('r007-3 mutaciones de catálogos solo para administradores', () => {
    let server;
    let client;
    let adminToken;
    let userToken;

    before(async () => {
        recreateDatabase();
        // Puerto 3101 libre en el rango 3100-3109; timeout holgado para el arranque en Windows
        server = await startServer({ port: 3101, timeoutMs: 30000 });
        client = api(server.baseUrl);
        adminToken = await login(server.baseUrl, USERS.admin.usuario, USERS.admin.clave);
        userToken = await login(server.baseUrl, USERS.user.usuario, USERS.user.clave);
    }, { timeout: 60000 });

    after(async () => {
        if (server) await server.stop();
    });

    describe('roles (/api/roles)', () => {
        it('POST /api/roles con token de usuario devuelve 403 y no crea registros', async () => {
            const antes = await client.get('/api/roles', { token: adminToken });
            assert.equal(antes.status, 200);

            const res = await client.post('/api/roles', {
                token: userToken,
                body: { nombre_rol: 'ROL_INTRUSO_TEST' },
            });
            assert.equal(res.status, 403);
            assert.equal(res.body.success, false);
            assert.match(res.body.message, /Acceso denegado|rol de admin/i);

            const despues = await client.get('/api/roles', { token: adminToken });
            assert.equal(despues.status, 200);
            assert.equal(despues.body.data.length, antes.body.data.length);
            assert.deepEqual(despues.body.data, antes.body.data);
        });

        it('PUT /api/roles/1 con token de usuario devuelve 403 y no modifica el registro', async () => {
            const antes = await client.get('/api/roles/1', { token: adminToken });
            assert.equal(antes.status, 200);

            const res = await client.put('/api/roles/1', {
                token: userToken,
                body: { nombre_rol: 'ROL_MODIFICADO_TEST' },
            });
            assert.equal(res.status, 403);
            assert.equal(res.body.success, false);
            assert.match(res.body.message, /Acceso denegado|rol de admin/i);

            const despues = await client.get('/api/roles/1', { token: adminToken });
            assert.equal(despues.status, 200);
            assert.deepEqual(despues.body.data, antes.body.data);
        });

        it('DELETE /api/roles/1 con token de usuario devuelve 403 y no elimina el registro', async () => {
            const antes = await client.get('/api/roles/1', { token: adminToken });
            assert.equal(antes.status, 200);

            const res = await client.delete('/api/roles/1', { token: userToken });
            assert.equal(res.status, 403);
            assert.equal(res.body.success, false);
            assert.match(res.body.message, /Acceso denegado|rol de admin/i);

            const despues = await client.get('/api/roles/1', { token: adminToken });
            assert.equal(despues.status, 200);
            assert.deepEqual(despues.body.data, antes.body.data);
        });

        it('control: GET /api/roles y GET /api/roles/1 con token de usuario devuelven 200', async () => {
            const resLista = await client.get('/api/roles', { token: userToken });
            assert.equal(resLista.status, 200);
            assert.equal(resLista.body.success, true);
            assert.ok(Array.isArray(resLista.body.data));

            const resDetalle = await client.get('/api/roles/1', { token: userToken });
            assert.equal(resDetalle.status, 200);
            assert.equal(resDetalle.body.success, true);
            assert.equal(resDetalle.body.data.id_rol, 1);
        });
    });

    describe('estados_papeletas (/api/estados_papeletas)', () => {
        it('POST /api/estados_papeletas con token de usuario devuelve 403 y no crea registros', async () => {
            const antes = await client.get('/api/estados_papeletas', { token: adminToken });
            assert.equal(antes.status, 200);

            const res = await client.post('/api/estados_papeletas', {
                token: userToken,
                body: { nombre_estado: 'ESTADO_INTRUSO_TEST' },
            });
            assert.equal(res.status, 403);
            assert.equal(res.body.success, false);
            assert.match(res.body.message, /Acceso denegado|rol de admin/i);

            const despues = await client.get('/api/estados_papeletas', { token: adminToken });
            assert.equal(despues.status, 200);
            assert.equal(despues.body.data.length, antes.body.data.length);
            assert.deepEqual(despues.body.data, antes.body.data);
        });

        it('PUT /api/estados_papeletas/1 con token de usuario devuelve 403 y no modifica el registro', async () => {
            const antes = await client.get('/api/estados_papeletas/1', { token: adminToken });
            assert.equal(antes.status, 200);

            const res = await client.put('/api/estados_papeletas/1', {
                token: userToken,
                body: { nombre_estado: 'ESTADO_MODIFICADO_TEST' },
            });
            assert.equal(res.status, 403);
            assert.equal(res.body.success, false);
            assert.match(res.body.message, /Acceso denegado|rol de admin/i);

            const despues = await client.get('/api/estados_papeletas/1', { token: adminToken });
            assert.equal(despues.status, 200);
            assert.deepEqual(despues.body.data, antes.body.data);
        });

        it('DELETE /api/estados_papeletas/1 con token de usuario devuelve 403 y no elimina el registro', async () => {
            const antes = await client.get('/api/estados_papeletas/1', { token: adminToken });
            assert.equal(antes.status, 200);

            const res = await client.delete('/api/estados_papeletas/1', { token: userToken });
            assert.equal(res.status, 403);
            assert.equal(res.body.success, false);
            assert.match(res.body.message, /Acceso denegado|rol de admin/i);

            const despues = await client.get('/api/estados_papeletas/1', { token: adminToken });
            assert.equal(despues.status, 200);
            assert.deepEqual(despues.body.data, antes.body.data);
        });

        it('control: GET /api/estados_papeletas y GET /api/estados_papeletas/1 con token de usuario devuelven 200', async () => {
            const resLista = await client.get('/api/estados_papeletas', { token: userToken });
            assert.equal(resLista.status, 200);
            assert.equal(resLista.body.success, true);
            assert.ok(Array.isArray(resLista.body.data));

            const resDetalle = await client.get('/api/estados_papeletas/1', { token: userToken });
            assert.equal(resDetalle.status, 200);
            assert.equal(resDetalle.body.success, true);
            assert.equal(resDetalle.body.data.id_estado, 1);
        });
    });

    describe('tipo_formulario (/api/tipo_formulario)', () => {
        it('POST /api/tipo_formulario con token de usuario devuelve 403 y no crea registros', async () => {
            const antes = await client.get('/api/tipo_formulario', { token: adminToken });
            assert.equal(antes.status, 200);

            const res = await client.post('/api/tipo_formulario', {
                token: userToken,
                body: { nombre: 'TIPO_INTRUSO_TEST' },
            });
            assert.equal(res.status, 403);
            assert.equal(res.body.success, false);
            assert.match(res.body.message, /Acceso denegado|rol de admin/i);

            const despues = await client.get('/api/tipo_formulario', { token: adminToken });
            assert.equal(despues.status, 200);
            assert.equal(despues.body.data.length, antes.body.data.length);
            assert.deepEqual(despues.body.data, antes.body.data);
        });

        it('PUT /api/tipo_formulario/1 con token de usuario devuelve 403 y no modifica el registro', async () => {
            const antes = await client.get('/api/tipo_formulario/1', { token: adminToken });
            assert.equal(antes.status, 200);

            const res = await client.put('/api/tipo_formulario/1', {
                token: userToken,
                body: { nombre: 'TIPO_MODIFICADO_TEST' },
            });
            assert.equal(res.status, 403);
            assert.equal(res.body.success, false);
            assert.match(res.body.message, /Acceso denegado|rol de admin/i);

            const despues = await client.get('/api/tipo_formulario/1', { token: adminToken });
            assert.equal(despues.status, 200);
            assert.deepEqual(despues.body.data, antes.body.data);
        });

        it('DELETE /api/tipo_formulario/1 con token de usuario devuelve 403 y no elimina el registro', async () => {
            const antes = await client.get('/api/tipo_formulario/1', { token: adminToken });
            assert.equal(antes.status, 200);

            const res = await client.delete('/api/tipo_formulario/1', { token: userToken });
            assert.equal(res.status, 403);
            assert.equal(res.body.success, false);
            assert.match(res.body.message, /Acceso denegado|rol de admin/i);

            const despues = await client.get('/api/tipo_formulario/1', { token: adminToken });
            assert.equal(despues.status, 200);
            assert.deepEqual(despues.body.data, antes.body.data);
        });

        it('control: GET /api/tipo_formulario y GET /api/tipo_formulario/1 con token de usuario devuelven 200', async () => {
            const resLista = await client.get('/api/tipo_formulario', { token: userToken });
            assert.equal(resLista.status, 200);
            assert.equal(resLista.body.success, true);
            assert.ok(Array.isArray(resLista.body.data));

            const resDetalle = await client.get('/api/tipo_formulario/1', { token: userToken });
            assert.equal(resDetalle.status, 200);
            assert.equal(resDetalle.body.success, true);
            assert.equal(resDetalle.body.data.id_tipo_formulario, 1);
        });
    });

    describe('papeleta_equipos (/api/papeleta_equipos)', () => {
        it('POST /api/papeleta_equipos con token de usuario devuelve 403 y no crea registros', async () => {
            const antes = await client.get('/api/papeleta_equipos', { token: adminToken });
            assert.equal(antes.status, 200);

            const res = await client.post('/api/papeleta_equipos', {
                token: userToken,
                body: { id_papeleta: 1, id_equipo: 3 },
            });
            assert.equal(res.status, 403);
            assert.equal(res.body.success, false);
            assert.match(res.body.message, /Acceso denegado|rol de admin/i);

            const despues = await client.get('/api/papeleta_equipos', { token: adminToken });
            assert.equal(despues.status, 200);
            assert.equal(despues.body.data.length, antes.body.data.length);
            assert.deepEqual(despues.body.data, antes.body.data);
        });

        it('PUT /api/papeleta_equipos/1 con token de usuario devuelve 403 y no modifica el registro', async () => {
            const antes = await client.get('/api/papeleta_equipos/1', { token: adminToken });
            assert.equal(antes.status, 200);

            const res = await client.put('/api/papeleta_equipos/1', {
                token: userToken,
                body: { id_papeleta: 1, id_equipo: 3 },
            });
            assert.equal(res.status, 403);
            assert.equal(res.body.success, false);
            assert.match(res.body.message, /Acceso denegado|rol de admin/i);

            const despues = await client.get('/api/papeleta_equipos/1', { token: adminToken });
            assert.equal(despues.status, 200);
            assert.deepEqual(despues.body.data, antes.body.data);
        });

        it('DELETE /api/papeleta_equipos/1 con token de usuario devuelve 403 y no elimina el registro', async () => {
            const antes = await client.get('/api/papeleta_equipos/1', { token: adminToken });
            assert.equal(antes.status, 200);

            const res = await client.delete('/api/papeleta_equipos/1', { token: userToken });
            assert.equal(res.status, 403);
            assert.equal(res.body.success, false);
            assert.match(res.body.message, /Acceso denegado|rol de admin/i);

            const despues = await client.get('/api/papeleta_equipos/1', { token: adminToken });
            assert.equal(despues.status, 200);
            assert.deepEqual(despues.body.data, antes.body.data);
        });

        it('control: GET /api/papeleta_equipos y GET /api/papeleta_equipos/1 con token de usuario devuelven 200', async () => {
            const resLista = await client.get('/api/papeleta_equipos', { token: userToken });
            assert.equal(resLista.status, 200);
            assert.equal(resLista.body.success, true);
            assert.ok(Array.isArray(resLista.body.data));

            const resDetalle = await client.get('/api/papeleta_equipos/1', { token: userToken });
            assert.equal(resDetalle.status, 200);
            assert.equal(resDetalle.body.success, true);
            assert.equal(resDetalle.body.data.id, 1);
        });
    });
});
