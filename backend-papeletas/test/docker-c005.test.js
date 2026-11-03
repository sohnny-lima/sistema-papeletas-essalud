const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { checkEnv } = require('../config/env');
const { startServer, api } = require('./helpers');

describe('c005 F1 salud y mismo origen', () => {
    it('g012 #5 comparte la comprobación y cachea éxito y fallo durante dos segundos', async () => {
        const { crearSonda } = require('../utils/sondaDisponibilidad');
        let ahora = 0, llamadas = 0, resolver;
        const comprobar = crearSonda(() => { llamadas++; return new Promise(r => { resolver = r; }); }, () => ahora);
        const peticiones = Array.from({ length: 50 }, () => comprobar());
        await Promise.resolve(); assert.equal(llamadas, 1); resolver(true);
        assert.deepEqual(await Promise.all(peticiones), Array(50).fill(true));
        ahora = 1999; assert.equal(await comprobar(), true); assert.equal(llamadas, 1);
        ahora = 2000; const pendiente = comprobar(); await Promise.resolve(); resolver(false);
        assert.equal(await pendiente, false); assert.equal(llamadas, 2);
        ahora = 3999; assert.equal(await comprobar(), false); assert.equal(llamadas, 2);
    });
    it('g012 #5 cincuenta peticiones HTTP abren como máximo una conexión de sonda', async () => {
        const net = require('node:net');
        let conexiones = 0, server;
        const sockets = new Set();
        const db = net.createServer(socket => { conexiones++; sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
        await new Promise(r => db.listen(0, '127.0.0.1', r));
        try {
            server = await startServer({ port: 3108, env: { DB_HOST: '127.0.0.1', DB_PORT: String(db.address().port), DB_CONNECTION_TIMEOUT_MS: '50' } });
            // La comprobación de arranque del pool no forma parte de la sonda HTTP.
            await new Promise(r => setTimeout(r, 200));
            const antes = conexiones;
            const respuestas = await Promise.all(Array.from({ length: 50 }, () => api(server.baseUrl).get('/api/salud/lista')));
            assert.ok(respuestas.every(r => r.status === 503));
            assert.equal(conexiones - antes, 1);
            assert.equal((await api(server.baseUrl).get('/api/salud/lista')).status, 503);
            assert.equal(conexiones - antes, 1);
        } finally {
            if (server) await server.stop();
            for (const socket of sockets) socket.destroy();
            await new Promise(r => db.close(r));
        }
    });
    it('c005 DNS transitorio del contenedor DB devuelve 503 en vez de 500', () => {
        const { mapDbError } = require('../utils/dbErrors');
        assert.equal(mapDbError({ code: 'EAI_AGAIN' }).status, 503);
    });
    it('c005 copia incluye todas las tablas aunque Docker consuma stdin', () => {
        const { spawnSync } = require('node:child_process');
        const path = require('node:path');
        const bash = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash';
        const r = spawnSync(bash, [path.join(__dirname, 'fixtures/docker-c005.sh')], { encoding: 'utf8', input: '', timeout: 10000 });
        assert.ifError(r.error); assert.equal(r.status, 0, r.stderr);
        assert.equal(r.stdout.trim().split(/\r?\n/).length, 3);
    });
    it('F1 CLIENT_URL es opcional en producción', () => {
        const env = { NODE_ENV: 'production', DB_HOST: 'localhost', DB_PORT: '55432',
            DB_NAME: 'bd_papeleta_ci', DB_USER: 'postgres', DB_PASSWORD: 'ficticia',
            JWT_SECRET: require('node:crypto').randomBytes(32).toString('hex') };
        assert.deepEqual(checkEnv(env).errors, []);
    });
    it('c005 vive sin PostgreSQL, disponibilidad 503 acotada y sin detalles', async () => {
        const server = await startServer({ port: 3108, env: { DB_HOST: '127.0.0.1', DB_PORT: '1', CLIENT_URL: '' } });
        try {
            const client = api(server.baseUrl);
            assert.equal((await client.get('/api/salud')).status, 200);
            const inicio = Date.now();
            const res = await client.get('/api/salud/lista');
            assert.equal(res.status, 503);
            assert.ok(Date.now() - inicio < 4500);
            assert.deepEqual(res.body, { success: false, message: 'Servicio no disponible.' });
            assert.equal(res.headers.get('access-control-allow-origin'), null);
            assert.equal((await client.get('/api/salud')).status, 200);
        } finally { await server.stop(); }
    });
    it('c005 TRUST_PROXY=1 separa la IP añadida por Nginx e ignora la falsificada a la izquierda', async () => {
        const server = await startServer({ port: 3108, env: { TRUST_PROXY: '1', LOGIN_RATE_LIMIT_MAX: '1' } });
        try {
            const client = api(server.baseUrl);
            const fallo = xff => client.post('/api/auth/login', { body: { nombreUsuario: 'inexistente', contrasena: 'incorrecta' }, headers: { 'X-Forwarded-For': xff } });
            assert.equal((await fallo('198.51.100.99, 192.0.2.1')).status, 401);
            assert.equal((await fallo('198.51.100.98, 192.0.2.1')).status, 429);
            assert.equal((await fallo('198.51.100.99, 192.0.2.2')).status, 401);
        } finally { await server.stop(); }
    });
});
