// Solo precarga de pruebas: estas rutas nunca se montan en producción.
const app = require('../../app');
const pool = require('../../config/database');
const { errorResponse, errorHandler } = require('../../utils/responseHandler');
const { safeRollback, releaseClient } = require('../../utils/transaccion');

// Retraso real en la consulta del login para verificar ambos límites en su ruta.
if (process.env.VM1_LOGIN_LENTO) {
    const query = pool.query;
    pool.query = function (texto, ...args) {
        if (typeof texto === 'string' && texto.includes('contrasena') && texto.includes('lower(nombre_usuario)')) {
            texto = { text: texto + ' AND (SELECT true FROM pg_sleep(2))',
                query_timeout: process.env.VM1_LOGIN_LENTO === 'cliente' ? 100 : 900 };
        }
        return query.call(this, texto, ...args);
    };
}

pool.on('connect', (client) => {
    const query = client.query;
    client.query = function (...args) {
        if (args[0] === 'ROLLBACK') console.log(JSON.stringify({ evento: 'vm1-rollback', pid: client.processID }));
        return query.apply(this, args);
    };
});
pool.on('remove', (client) => console.log(JSON.stringify({ evento: 'vm1-descarte', pid: client.processID })));
for (const [ruta, query] of [
    ['/__vm1/lenta', { text: 'SELECT pg_sleep(2)' }],
    ['/__vm1/cliente', { text: 'SELECT pg_sleep(2)', query_timeout: 100 }],
]) {
    app.get(ruta, async (_req, res) => {
        try { await pool.query(query); res.json({ success: true }); }
        catch (error) { errorResponse(res, error, 'Consulta VM1'); }
    });
}
app.get('/__vm1/error', (req, res) => errorHandler(new Error('DATO_PRIVADO'), req, res, () => {}));
app.get('/__vm1/transaccion-cliente', async (_req, res) => {
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        await client.query("INSERT INTO lugares (nombre_ambiente, dependencia, id_centro) VALUES ('VM1_PARCIAL', 'PRUEBAS', 1)");
        await client.query({ text: 'SELECT pg_sleep(2)', query_timeout: 100 });
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (error) {
        if (client) await safeRollback(client, error);
        errorResponse(res, error, 'Transacción con plazo del cliente VM1');
    } finally { releaseClient(client); }
});
app.get('/__vm1/interrumpida', (_req, res) => {
    res.write('inicio');
    res.destroy();
});
app.get('/__vm1/sin-cabeceras/:id', (_req, res) => res.destroy());
app.get('/__vm1/inactiva', async (_req, res) => {
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        // El listener de producción debe absorber el error asíncrono entre consultas.
        await new Promise(resolve => setTimeout(resolve, 600));
        await client.query('SELECT 1');
        res.json({ success: true });
    } catch (error) {
        if (client) await safeRollback(client, error);
        errorResponse(res, error, 'Transacción inactiva VM1');
    } finally { releaseClient(client); }
});
