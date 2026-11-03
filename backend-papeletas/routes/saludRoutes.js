const router = require('express').Router();
const { Client } = require('pg');
const { databaseConfig } = require('../config/env');
const { crearSonda } = require('../utils/sondaDisponibilidad');

router.get('/', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ success: true, message: 'Servicio activo.' });
});
const disponible = crearSonda(async () => {
    let cliente;
    try {
        // Independiente del pool, pero compartida por las peticiones de esta instancia.
        cliente = new Client({ ...databaseConfig(), connectionTimeoutMillis: 1500,
            query_timeout: 1500, statement_timeout: 1500 });
        cliente.on('error', () => {});
        await cliente.connect();
        await cliente.query('SELECT 1');
        return true;
    } finally {
        if (cliente) await cliente.end().catch(() => {});
    }
});
router.get('/lista', async (_req, res) => {
    const ok = await disponible();
    res.status(ok ? 200 : 503).set('Cache-Control', 'no-store').json({
        success: ok, message: ok ? 'Servicio disponible.' : 'Servicio no disponible.'
    });
});
module.exports = router;
