const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const net = require('node:net');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { Client } = require('pg');
const { checkEnv, databaseConfig, apiDatabaseConfig } = require('../config/env');
const { mapDbError } = require('../utils/dbErrors');
const { logError } = require('../utils/securityLog');
const { safeRollback, releaseClient } = require('../utils/transaccion');
const { conservarErrorCliente } = require('../utils/clienteConError');
const { DB_CONFIG, REPO_ROOT, resetSchemaAndData, startServer, api, login, USERS } = require('./helpers');

const pausa = ms => new Promise(r => setTimeout(r, ms));
const fixture = path.join(__dirname, 'fixtures/cierre-vm1-servidor.js');
const config = {
    DB_HOST: DB_CONFIG.host, DB_PORT: String(DB_CONFIG.port), DB_NAME: DB_CONFIG.database,
    DB_USER: DB_CONFIG.user, DB_PASSWORD: DB_CONFIG.password, JWT_SECRET: crypto.randomBytes(32).toString('hex'),
};
function eventos(server, evento) {
    return server.proc.stdoutLog.split(/\r?\n/).filter(l => l.startsWith('{')).map(l => JSON.parse(l))
        .filter(e => e.evento === evento);
}
async function esperar(condicion) {
    const fin = Date.now() + 3000;
    while (!condicion() && Date.now() < fin) await pausa(15);
    assert.ok(condicion(), 'la evidencia debe aparecer antes de 3 s');
}
async function backend(env = {}) {
    return startServer({ port: 3108, env: {
        NODE_OPTIONS: '--require=' + JSON.stringify(fixture),
        DB_STATEMENT_TIMEOUT_MS: '300', DB_QUERY_TIMEOUT_MS: '900',
        DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: '5000', ...env,
    } });
}

describe('VM1 límites validados y aislamiento de operaciones', () => {
    it('VM1 valores por defecto solo en el pool de la API y coherentes con Compose y ejemplos', () => {
        const apiConfig = apiDatabaseConfig(config);
        const base = databaseConfig(config);
        for (const [variable, opcion, valor] of [
            ['DB_STATEMENT_TIMEOUT_MS', 'statement_timeout', 15000],
            ['DB_QUERY_TIMEOUT_MS', 'query_timeout', 18000],
            ['DB_IDLE_IN_TRANSACTION_TIMEOUT_MS', 'idle_in_transaction_session_timeout', 30000],
        ]) {
            assert.equal(apiConfig[opcion], valor);
            assert.equal(base[opcion], undefined);
            for (const archivo of ['deploy/.env.example', 'backend-papeletas/.env.example']) {
                assert.match(fs.readFileSync(path.join(REPO_ROOT, archivo), 'utf8'), new RegExp('^' + variable + '=' + valor + '\\s*$', 'm'));
            }
            assert.ok(fs.readFileSync(path.join(REPO_ROOT, 'deploy/compose.yaml'), 'utf8').includes(variable + ': ${' + variable + ':-' + valor + '}'));
        }
        assert.equal(checkEnv(config).errors.length, 0);
    });
    for (const variable of ['DB_STATEMENT_TIMEOUT_MS', 'DB_QUERY_TIMEOUT_MS', 'DB_IDLE_IN_TRANSACTION_TIMEOUT_MS']) {
        it(`VM1 ${variable} rechaza cero, negativos, fracciones, vacío y desbordamiento`, () => {
            for (const valor of ['0', '-1', '1.5', '', 'abc', ' 300 ', '2147483648']) {
                assert.ok(checkEnv({ ...config, [variable]: valor }).errors.some(e => e.includes(variable)), valor);
                assert.throws(() => apiDatabaseConfig({ ...config, [variable]: valor }), new RegExp(variable));
            }
        });
    }
    it('VM1 consulta mayor que sentencia; ACCESS_LOG_ENABLED admite únicamente true o false', () => {
        for (const valor of ['14999', '15000']) assert.ok(checkEnv({ ...config, DB_QUERY_TIMEOUT_MS: valor }).errors.some(e => e.includes('mayor')));
        for (const valor of ['true', 'false']) assert.equal(checkEnv({ ...config, ACCESS_LOG_ENABLED: valor }).errors.length, 0);
        for (const valor of ['1', 'FALSE', '', 'sí']) assert.ok(checkEnv({ ...config, ACCESS_LOG_ENABLED: valor }).errors.some(e => e.includes('ACCESS_LOG_ENABLED')));
    });
    it('VM1 errores de plazo producen 503 y etiqueta fija sin mensaje original', () => {
        const lineas = [];
        const anterior = console.error;
        console.error = l => lineas.push(l);
        try {
            for (const error of [{ code: '57014', message: 'DATO_PRIVADO' }, { code: '25P03' }, new Error('Query read timeout')]) {
                assert.equal(mapDbError(error).status, 503);
                assert.match(mapDbError(error).reason, /tardó demasiado/);
                logError('VM1', error, 'a'.repeat(32));
            }
        } finally { console.error = anterior; }
        assert.equal(lineas.length, 3);
        for (const linea of lineas) {
            assert.match(linea, /\[TIEMPO_CONSULTA_AGOTADO\].*id=a{32}$/);
            assert.ok(!linea.includes('DATO_PRIVADO'));
        }
        assert.equal(mapDbError(new Error('Query read timeout DATO_PRIVADO')), null);
    });
    it('g024-1 conserva el primer error fatal ante not queryable en promesa, callback o lanzamiento síncrono', async () => {
        for (const mensaje of ['Client has encountered a connection error and is not queryable', 'Client was closed and is not queryable']) {
            for (const modo of ['promesa', 'callback', 'sincrono']) {
                const client = new EventEmitter();
                client.query = (...args) => {
                    const error = new Error(mensaje);
                    if (modo === 'callback') return args.at(-1)(error);
                    if (modo === 'sincrono') throw error;
                    return Promise.reject(error);
                };
                conservarErrorCliente(client);
                const original = Object.assign(new Error('Causa original'), { code: '25P03' });
                client.emit('error', original);
                client.emit('error', new Error('Connection terminated unexpectedly'));
                if (modo === 'callback') {
                    client.query('SELECT 1', error => assert.equal(error, original));
                } else if (modo === 'sincrono') {
                    assert.throws(() => client.query('SELECT 1'), error => error === original);
                } else {
                    await assert.rejects(client.query('SELECT 1'), error => error === original);
                }
            }
        }
    });
    it('g024-4 valida el límite de conexión y rechaza el arranque inválido antes de abrir la API', () => {
        assert.equal(apiDatabaseConfig(config).connectionTimeoutMillis, 10000);
        for (const valor of ['1', '10000', '2147483647']) {
            assert.equal(checkEnv({ ...config, DB_CONNECTION_TIMEOUT_MS: valor }).errors.length, 0);
        }
        for (const valor of ['0', '-1', '1.5', '', 'abc', ' 300 ', '2147483648']) {
            assert.ok(checkEnv({ ...config, DB_CONNECTION_TIMEOUT_MS: valor }).errors.some(e => e.includes('DB_CONNECTION_TIMEOUT_MS')));
        }
        const resultado = spawnSync(process.execPath, ['index.js'], {
            cwd: path.join(REPO_ROOT, 'backend-papeletas'), encoding: 'utf8', timeout: 10000,
            env: { ...process.env, ...config, NODE_ENV: 'test', DB_PASSWORD_FILE: '', JWT_SECRET_FILE: '', DB_CONNECTION_TIMEOUT_MS: '0' },
        });
        assert.equal(resultado.status, 1, resultado.stderr);
        assert.match(resultado.stderr, /DB_CONNECTION_TIMEOUT_MS debe ser un entero entre 1 y 2147483647/);
        assert.ok(!resultado.stderr.includes(config.JWT_SECRET));
    });
    it('VM1 descarta conexiones agotadas o rotas; rollback SQL solo cuando puede contestar', async () => {
        for (const error of [{ code: '57014' }, { code: '25P03' }, new Error('Query read timeout'), { code: 'ECONNRESET' }]) {
            const consultas = [];
            let descarte;
            const client = { query: async q => consultas.push(q), release: e => { descarte = e; } };
            await safeRollback(client, error);
            releaseClient(client);
            assert.equal(descarte, true);
            assert.deepEqual(consultas, error.code === '57014' ? ['ROLLBACK'] : []);
        }
    });
});

describe('VM1 consultas, transacciones, acceso y recuperación HTTP', () => {
    let server, cliente, sql, token;
    before(async () => {
        resetSchemaAndData();
        sql = new Client(DB_CONFIG);
        await sql.connect();
        server = await backend();
        cliente = api(server.baseUrl);
        token = await login(server.baseUrl, USERS.admin.usuario, USERS.admin.clave);
    });
    after(async () => {
        if (server) await server.stop();
        if (sql) {
            await sql.query('DROP FUNCTION IF EXISTS vm1_demora() CASCADE');
            await sql.end();
        }
    });
    for (const ruta of ['/__vm1/lenta', '/__vm1/cliente']) {
        it(`VM1 ${ruta} agota plazo, descarta cliente y después responde 200`, async () => {
            const antes = eventos(server, 'vm1-descarte').length;
            const inicio = Date.now();
            const res = await cliente.get(ruta);
            assert.equal(res.status, 503, res.text);
            assert.ok(Date.now() - inicio < 1500, 'respuesta limitada, no espera los 2 s de pg_sleep');
            assert.match(res.body.message, /tardó demasiado/);
            await esperar(() => eventos(server, 'vm1-descarte').length > antes);
            await esperar(() => server.proc.stderrLog.includes('id=' + res.headers.get('x-request-id')));
            assert.match(server.proc.stderrLog, /\[TIEMPO_CONSULTA_AGOTADO\]/);
            assert.equal((await cliente.get('/api/equipos', { token })).status, 200);
        });
    }
    it('VM1 query_timeout en transacción cierra sin encolar ROLLBACK y PostgreSQL revierte lo insertado', async () => {
        const antes = eventos(server, 'vm1-descarte').length;
        const rollbacks = eventos(server, 'vm1-rollback').length;
        const inicio = Date.now();
        const res = await cliente.get('/__vm1/transaccion-cliente');
        assert.equal(res.status, 503, res.text);
        assert.ok(Date.now() - inicio < 1500);
        await esperar(() => eventos(server, 'vm1-descarte').length > antes);
        assert.equal(eventos(server, 'vm1-rollback').length, rollbacks);
        assert.equal((await sql.query("SELECT 1 FROM lugares WHERE nombre_ambiente='VM1_PARCIAL'")).rowCount, 0);
        assert.equal((await cliente.get('/api/equipos', { token })).status, 200);
    });
    it('VM1 alta administrativa independiente de variables exclusivas de la API', async () => {
        const resultado = spawnSync(process.execPath, ['scripts/crear-admin.js', 'admin_c010'], {
            cwd: path.join(REPO_ROOT, 'backend-papeletas'), encoding: 'utf8', timeout: 10000,
            input: crypto.randomBytes(24).toString('hex') + 'Ab1\n',
            env: { ...process.env, ...config, NODE_ENV: 'test', DB_PASSWORD_FILE: '', JWT_SECRET_FILE: '',
                DB_STATEMENT_TIMEOUT_MS: '0', DB_QUERY_TIMEOUT_MS: '0', DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: '0' },
        });
        try { assert.equal(resultado.status, 0, resultado.stderr); }
        finally { await sql.query("DELETE FROM usuarios WHERE nombre_usuario='admin_c010'"); }
    });
    it('VM1 transacción DELETE agotada hace ROLLBACK, conserva padre e hijos, descarta y se recupera; fecha textual', async () => {
        const { rows: [papeleta] } = await sql.query("SELECT id_papeleta, TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha FROM papeletas ORDER BY id_papeleta LIMIT 1");
        const id = papeleta.id_papeleta;
        const hijos = await sql.query('SELECT * FROM papeleta_equipos WHERE id_papeleta=$1 ORDER BY id', [id]);
        assert.ok(hijos.rowCount > 0);
        await sql.query(`CREATE FUNCTION vm1_demora() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN PERFORM pg_sleep(2); RETURN OLD; END $$;
            CREATE TRIGGER vm1_demora BEFORE DELETE ON papeletas FOR EACH ROW EXECUTE FUNCTION vm1_demora()`);
        const antesRollback = eventos(server, 'vm1-rollback').length;
        const antesDescarte = eventos(server, 'vm1-descarte').length;
        try {
            const res = await cliente.delete('/api/papeletas/' + id, { token });
            assert.equal(res.status, 503, res.text);
            await esperar(() => eventos(server, 'vm1-rollback').length > antesRollback && eventos(server, 'vm1-descarte').length > antesDescarte);
            const rollback = eventos(server, 'vm1-rollback').at(-1);
            assert.ok(eventos(server, 'vm1-descarte').some(e => e.pid === rollback.pid));
            assert.equal((await sql.query('SELECT 1 FROM papeletas WHERE id_papeleta=$1', [id])).rowCount, 1);
            assert.deepEqual((await sql.query('SELECT * FROM papeleta_equipos WHERE id_papeleta=$1 ORDER BY id', [id])).rows, hijos.rows);
        } finally { await sql.query('DROP FUNCTION vm1_demora() CASCADE'); }
        const borrada = await cliente.delete('/api/papeletas/' + id, { token });
        assert.equal(borrada.status, 200, borrada.text);
        assert.equal(borrada.body.data.fecha, papeleta.fecha);
        assert.match(borrada.body.data.fecha, /^\d{4}-\d{2}-\d{2}$/);
    });
    it('VM1 acceso JSON único, patrón de ruta, sin búsqueda ni Authorization; identificador válido conservado', async () => {
        const id = 'b'.repeat(32);
        const res = await cliente.get('/api/equipos/1?buscar=DATO_PRIVADO', { token, headers: { 'X-Request-Id': id } });
        assert.equal(res.status, 200, res.text);
        assert.equal(res.headers.get('x-request-id'), id);
        await esperar(() => eventos(server, 'acceso').some(e => e.idPeticion === id));
        const registros = eventos(server, 'acceso').filter(e => e.idPeticion === id);
        assert.equal(registros.length, 1);
        const acceso = registros[0];
        assert.deepEqual(Object.keys(acceso).sort(), ['evento', 'fecha', 'idPeticion', 'metodo', 'ruta', 'estado', 'duracionMs', 'idUsuario', 'interrumpida'].sort());
        assert.equal(acceso.ruta, '/api/equipos/:id');
        assert.equal(acceso.metodo, 'GET');
        assert.equal(acceso.estado, 200);
        assert.equal(acceso.interrumpida, false);
        assert.equal(typeof acceso.idUsuario, 'number');
        assert.ok(acceso.duracionMs >= 0 && Number.isFinite(acceso.duracionMs));
        assert.ok(Number.isFinite(Date.parse(acceso.fecha)));
        const logs = server.proc.stdoutLog + server.proc.stderrLog;
        for (const privado of ['DATO_PRIVADO', token, 'Authorization', 'Bearer']) assert.ok(!logs.includes(privado));
    });
    it('VM1 identificador inválido sustituido y errorHandler correlacionado sin filtrar error', async () => {
        const res = await cliente.get('/__vm1/error?buscar=DATO_PRIVADO', { headers: { 'X-Request-Id': 'NO_VALIDO_DATO_PRIVADO' } });
        assert.equal(res.status, 500);
        const id = res.headers.get('x-request-id');
        assert.match(id, /^[a-f0-9]{32}$/);
        await esperar(() => server.proc.stderrLog.includes('Error inesperado [ERROR_INTERNO] name=Error id=' + id));
        assert.ok(!(server.proc.stdoutLog + server.proc.stderrLog).includes('DATO_PRIVADO'));
    });
    it('g024-3 no registra datos del path en un 404 ni el identificador de un 401 antes de la ruta', async () => {
        for (const [ruta, estado, segura] of [
            ['/no-existe/DATO_PRIVADO_404', 404, 'SIN_RUTA'],
            ['/api/equipos/123', 401, '/api/equipos'],
        ]) {
            const res = await cliente.get(ruta);
            assert.equal(res.status, estado);
            const id = res.headers.get('x-request-id');
            await esperar(() => eventos(server, 'acceso').some(e => e.idPeticion === id));
            const acceso = eventos(server, 'acceso').filter(e => e.idPeticion === id);
            assert.equal(acceso.length, 1);
            assert.equal(acceso[0].ruta, segura);
        }
        assert.ok(!(server.proc.stdoutLog + server.proc.stderrLog).includes('DATO_PRIVADO_404'));
    });
    it('g024-3 toma el patrón de Express al cerrarse sin writeHead', async () => {
        const id = 'd'.repeat(32);
        await new Promise(resolve => {
            const req = http.get(server.baseUrl + '/__vm1/sin-cabeceras/DATO_PRIVADO_CORTE', { headers: { 'X-Request-Id': id } }, res => {
                res.resume(); res.on('close', resolve); res.on('error', resolve);
            });
            req.on('error', resolve);
        });
        await esperar(() => eventos(server, 'acceso').some(e => e.idPeticion === id));
        const acceso = eventos(server, 'acceso').filter(e => e.idPeticion === id);
        assert.equal(acceso.length, 1);
        assert.equal(acceso[0].ruta, '/__vm1/sin-cabeceras/:id');
        assert.equal(acceso[0].interrumpida, true);
        assert.ok(!server.proc.stdoutLog.includes('DATO_PRIVADO_CORTE'));
    });
    it('VM1 excluye todas las rutas de salud, incluso no encontradas', async () => {
        for (const ruta of ['/api/salud', '/api/salud/lista', '/api/salud/no-existe', '/api/salud-otra']) {
            const res = await cliente.get(ruta);
            assert.match(res.headers.get('x-request-id'), /^[a-f0-9]{32}$/);
        }
        await pausa(40);
        assert.ok(!eventos(server, 'acceso').some(e => e.ruta.startsWith('/api/salud')));
    });
    it('VM1 registra una sola línea al cerrarse una respuesta interrumpida', async () => {
        const id = 'c'.repeat(32);
        await new Promise(resolve => {
            const req = http.get(server.baseUrl + '/__vm1/interrumpida', { headers: { 'X-Request-Id': id } }, res => {
                res.resume(); res.on('close', resolve); res.on('error', resolve);
            });
            req.on('error', resolve);
        });
        await esperar(() => eventos(server, 'acceso').some(e => e.idPeticion === id));
        const registros = eventos(server, 'acceso').filter(e => e.idPeticion === id);
        assert.equal(registros.length, 1);
        assert.equal(registros[0].interrumpida, true);
    });
});

describe('VM1 otros fallos y configuración de acceso', () => {
    for (const limite of ['servidor', 'cliente']) {
        it(`g024-2 login agotado por ${limite} devuelve 503 con motivo e id`, async () => {
            const server = await backend({ VM1_LOGIN_LENTO: limite });
            try {
                const res = await api(server.baseUrl).post('/api/auth/login', {
                    body: { nombreUsuario: USERS.admin.usuario, contrasena: USERS.admin.clave },
                });
                assert.equal(res.status, 503, res.text);
                assert.deepEqual(res.body, { success: false,
                    message: 'La base de datos tardó demasiado en responder. Inténtelo más tarde.' });
                const id = res.headers.get('x-request-id');
                await esperar(() => server.proc.stderrLog.includes('id=' + id));
                const lineas = server.proc.stderrLog.trim().split(/\r?\n/);
                assert.equal(lineas.length, 1);
                assert.match(lineas[0], new RegExp('\\[TIEMPO_CONSULTA_AGOTADO\\].*id=' + id + '$'));
            } finally { await server.stop(); }
        });
    }
    it('VM1 ACCESS_LOG_ENABLED=false conserva identificador y no emite acceso', async () => {
        const server = await backend({ ACCESS_LOG_ENABLED: 'false' });
        try {
            const res = await api(server.baseUrl).get('/');
            assert.match(res.headers.get('x-request-id'), /^[a-f0-9]{32}$/);
            await pausa(30);
            assert.equal(eventos(server, 'acceso').length, 0);
        } finally { await server.stop(); }
    });
    it('g024-1 25P03 entre consultas responde por plazo y registra una sola causa con id; después se recupera', async () => {
        const server = await backend({ DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: '150' });
        try {
            const antes = server.proc.stderrLog.length;
            const res = await api(server.baseUrl).get('/__vm1/inactiva');
            assert.equal(res.status, 503, res.text);
            assert.match(res.body.message, /La base de datos tardó demasiado en responder/);
            const id = res.headers.get('x-request-id');
            await esperar(() => server.proc.stderrLog.includes('id=' + id));
            const token = await login(server.baseUrl, USERS.admin.usuario, USERS.admin.clave);
            assert.equal((await api(server.baseUrl).get('/api/equipos', { token })).status, 200);
            assert.equal(server.proc.exitCode, null);
            const lineas = server.proc.stderrLog.slice(antes).trim().split(/\r?\n/).filter(Boolean);
            assert.equal(lineas.length, 1, lineas.join('\n'));
            assert.match(lineas[0], new RegExp('\\[TIEMPO_CONSULTA_AGOTADO\\].*id=' + id + '$'));
        } finally { await server.stop(); }
    });
    it('VM1 base inaccesible por proxy TCP: 503 rápido y 200 al volver sin reiniciar backend', async () => {
        let disponible = true;
        const sockets = new Set();
        const proxy = net.createServer(cliente => {
            sockets.add(cliente);
            cliente.on('error', () => {});
            cliente.on('close', () => sockets.delete(cliente));
            if (!disponible) return cliente.destroy();
            const bd = net.connect(DB_CONFIG.port, DB_CONFIG.host, () => { cliente.pipe(bd); bd.pipe(cliente); });
            sockets.add(bd);
            bd.on('error', () => cliente.destroy());
            bd.on('close', () => { sockets.delete(bd); cliente.destroy(); });
        });
        await new Promise(r => proxy.listen(0, '127.0.0.1', r));
        let server;
        try {
            server = await backend({ DB_HOST: '127.0.0.1', DB_PORT: String(proxy.address().port), DB_CONNECTION_TIMEOUT_MS: '500' });
            const token = await login(server.baseUrl, USERS.admin.usuario, USERS.admin.clave);
            const pedir = () => api(server.baseUrl).get('/api/equipos', { token });
            assert.equal((await pedir()).status, 200);
            disponible = false;
            for (const socket of sockets) socket.destroy();
            const inicio = Date.now();
            const fallo = await pedir();
            assert.equal(fallo.status, 503, fallo.text);
            assert.ok(Date.now() - inicio < 1500);
            disponible = true;
            assert.equal((await pedir()).status, 200);
            assert.equal(server.proc.exitCode, null);
        } finally {
            if (server) await server.stop();
            for (const socket of sockets) socket.destroy();
            await new Promise(r => proxy.close(r));
        }
    });
});
