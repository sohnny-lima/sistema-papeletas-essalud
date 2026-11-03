// VM1 (validación manual, 29/10/2026): GET /api/equipos devolvió 503 en la primera entrada
// tras unos minutos sin uso. El pool cierra las conexiones inactivas a los 10 s; la siguiente
// petición abre una nueva y, si tarda más que DB_CONNECTION_TIMEOUT_MS (3 s en Docker), la
// API responde «base de datos no disponible» aunque PostgreSQL esté sano.
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const net = require('node:net');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');
const { logError } = require('../utils/securityLog');
const { mapDbError } = require('../utils/dbErrors');
const { REPO_ROOT, DB_CONFIG, USERS, resetSchemaAndData, startServer, api } = require('./helpers');

const RETRASO_MS = 4000; // conexión nueva lenta pero sana, por encima de los 3 s del incidente

// Valor que usa la instalación Docker cuando el .env no lo fija.
function limiteDocker() {
    const compose = fs.readFileSync(path.join(REPO_ROOT, 'deploy', 'compose.yaml'), 'utf8');
    const m = compose.match(/DB_CONNECTION_TIMEOUT_MS:\s*\$\{DB_CONNECTION_TIMEOUT_MS:-(\d+)\}/);
    assert.ok(m, 'compose.yaml debe fijar un valor por defecto para DB_CONNECTION_TIMEOUT_MS');
    return m[1];
}

// Proxy TCP hacia la base de pruebas que retrasa cada conexión nueva.
// r002-3: la primera conexión es siempre la comprobación de arranque (index.js); se retiene
// sin reenviarla para que nunca quede libre en el pool y la petición medida abra la suya.
// r002b-2: contador incremental y señal de la primera conexión, sin depender de milisegundos.
async function proxyLento(retrasoMs) {
    const sockets = new Set();
    let aperturas = 0;
    let retraso = retrasoMs;
    let avisarPrimera;
    const primera = new Promise((r) => { avisarPrimera = r; });
    const servidor = net.createServer((cliente) => {
        aperturas++;
        sockets.add(cliente);
        cliente.on('error', () => {});
        cliente.on('close', () => sockets.delete(cliente));
        cliente.pause();
        if (aperturas === 1) return avisarPrimera();
        const temporizador = setTimeout(() => {
            const bd = net.connect(DB_CONFIG.port, DB_CONFIG.host, () => { cliente.pipe(bd); bd.pipe(cliente); });
            sockets.add(bd);
            bd.on('error', () => cliente.destroy());
            bd.on('close', () => { sockets.delete(bd); cliente.destroy(); });
        }, retraso);
        cliente.on('close', () => clearTimeout(temporizador));
    });
    await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
    return {
        puerto: servidor.address().port,
        aperturas: () => aperturas,
        primera,
        sinRetraso: () => { retraso = 0; },
        cerrar: async () => {
            for (const s of sockets) s.destroy();
            await new Promise((r) => servidor.close(r));
        },
    };
}

// Token firmado antes de arrancar el backend, con su secreto, y sin pasar por el proxy.
async function tokenUsuario(jwtSecret) {
    const cliente = new Client(DB_CONFIG);
    await cliente.connect();
    try {
        const { rows } = await cliente.query(
            'SELECT id_usuario, version_sesion FROM usuarios WHERE nombre_usuario = $1', [USERS.user.usuario]);
        return jwt.sign({ idUsuario: rows[0].id_usuario, ver: rows[0].version_sesion },
            jwtSecret, { algorithm: 'HS256', expiresIn: '5m' });
    } finally {
        await cliente.end();
    }
}

async function conBackend(limite, prueba) {
    // r002b-1: el token se obtiene antes de abrir el proxy; si falla, no queda nada escuchando.
    const jwtSecret = crypto.randomBytes(32).toString('hex');
    const token = await tokenUsuario(jwtSecret);
    const proxy = await proxyLento(RETRASO_MS);
    let server;
    try {
        server = await startServer({ port: 3109, jwtSecret, env: {
            DB_HOST: '127.0.0.1', DB_PORT: String(proxy.puerto), DB_CONNECTION_TIMEOUT_MS: limite } });
        // La comprobación de arranque ya ocupa la primera conexión antes de cualquier petición.
        let limiteEspera;
        await Promise.race([proxy.primera, new Promise((_, mal) => {
            limiteEspera = setTimeout(() => mal(new Error('El backend no abrió la conexión de arranque en 5 s')), 5000);
        })]).finally(() => clearTimeout(limiteEspera));
        const pedir = async () => {
            const antes = proxy.aperturas();
            const inicio = Date.now();
            const res = await api(server.baseUrl).get('/api/equipos?page=1&pageSize=10', { token });
            return { res, ms: Date.now() - inicio, nuevas: proxy.aperturas() - antes };
        };
        return await prueba({ pedir, proxy, stderr: () => server.proc.stderrLog });
    } finally {
        if (server) await server.stop();
        await proxy.cerrar();
    }
}

describe('VM1 primera petición tras inactividad con conexión nueva lenta', () => {
    before(() => resetSchemaAndData());

    it('VM1 con el límite por defecto de Docker, una conexión nueva de 4 s responde 200 y no 503', async () => {
        const limite = limiteDocker();
        await conBackend(limite, async ({ pedir }) => {
            const { res, ms, nuevas } = await pedir();
            assert.equal(res.status, 200, `límite ${limite} ms, ${ms} ms: ${JSON.stringify(res.body)}`);
            assert.equal(nuevas, 1, 'la petición debe abrir su propia conexión por el proxy lento');
            assert.ok(ms >= RETRASO_MS - 100, `la conexión debía ser nueva y lenta (${ms} ms)`);
            assert.equal(res.body.success, true);
            assert.ok(Array.isArray(res.body.data.data) && res.body.data.data.length > 0);
        });
    });

    it('VM1 una conexión que supera el límite responde 503, el registro la identifica y la siguiente se recupera', async () => {
        await conBackend('1000', async ({ pedir, proxy, stderr }) => {
            const fallo = await pedir();
            assert.equal(fallo.res.status, 503);
            assert.equal(fallo.nuevas, 1);
            assert.match(fallo.res.body.message, /^No se pudo verificar la sesión\. La base de datos no está disponible/);
            // Pool vacío: se agota la apertura de la conexión nueva, como en el incidente.
            assert.match(stderr(), /No se pudo verificar la sesión \[TIEMPO_APERTURA_AGOTADO\] name=Error/);
            // Sin reintentos: es la petición siguiente la que abre otra conexión y responde.
            proxy.sinRetraso();
            const despues = await pedir();
            assert.equal(despues.res.status, 200, JSON.stringify(despues.res.body));
            assert.equal(despues.nuevas, 1);
        });
    });

    it('VM1 r002-2 los mensajes de pg sin code se clasifican como conexión y con etiqueta fija', () => {
        const casos = [
            ['timeout exceeded when trying to connect', 'TIEMPO_CONEXION_AGOTADO'],
            ['Connection terminated due to connection timeout', 'TIEMPO_APERTURA_AGOTADO'],
            ['timeout expired', 'TIEMPO_APERTURA_AGOTADO'],
            ['Connection terminated unexpectedly', 'CONEXION_INTERRUMPIDA'],
            ['Connection terminated', 'CONEXION_TERMINADA'],
        ];
        const lineas = [];
        const original = console.error;
        console.error = (l) => lineas.push(l);
        try {
            for (const [mensaje] of casos) logError('Contexto', new Error(mensaje));
            logError('Contexto', new Error('timeout expired DATO_PRIVADO'));
        } finally {
            console.error = original;
        }
        casos.forEach(([mensaje, etiqueta], i) => {
            assert.equal(lineas[i], `Contexto [${etiqueta}] name=Error`);
            assert.equal(mapDbError(new Error(mensaje)).status, 503, mensaje);
        });
        assert.equal(lineas[casos.length], 'Contexto [ERROR_INTERNO] name=Error');
        assert.equal(mapDbError(new Error('timeout expired DATO_PRIVADO')), null);
    });

    it('VM1 g024-3 la auditoría no copia segmentos del path sin patrón (404 y 401)', async () => {
        const server = await startServer({ port: 3109, env: { AUDIT_ENABLED: 'true' } });
        try {
            const cliente = api(server.baseUrl);
            assert.equal((await cliente.post('/api/no-existe/DATO_FICTICIO_12345678', { body: {} })).status, 404);
            assert.equal((await cliente.post('/api/equipos/DATO_FICTICIO_87654321', { body: {} })).status, 401);
            await new Promise((r) => setTimeout(r, 50));
            const auditoria = server.proc.stdoutLog.split(/\r?\n/).filter((l) => l.startsWith('{'))
                .map((l) => JSON.parse(l)).filter((e) => e.evento === 'auditoria');
            assert.deepEqual(auditoria.map((e) => [e.codigoRespuesta, e.ruta]), [[404, 'SIN_RUTA'], [401, '/api/equipos']]);
            assert.ok(!server.proc.stdoutLog.includes('DATO_FICTICIO'));
        } finally {
            await server.stop();
        }
    });

    it('VM1 el .env de ejemplo de Docker usa el mismo límite que compose.yaml', () => {
        const ejemplo = fs.readFileSync(path.join(REPO_ROOT, 'deploy', '.env.example'), 'utf8');
        const m = ejemplo.match(/^DB_CONNECTION_TIMEOUT_MS=(\d+)\s*$/m);
        assert.ok(m, 'deploy/.env.example debe incluir DB_CONNECTION_TIMEOUT_MS');
        assert.equal(m[1], limiteDocker());
    });
});
