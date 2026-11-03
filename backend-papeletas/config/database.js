const { Pool } = require('pg');
const { apiDatabaseConfig } = require('./env');
const { logError } = require('../utils/securityLog');
const { conservarErrorCliente } = require('../utils/clienteConError');

// Configuración de la conexión
const pool = new Pool(apiDatabaseConfig());

// Durante pool.connect() no está el listener del pool para clientes inactivos.
// Una desconexión (incluido 25P03) entre dos consultas no debe cerrar el proceso.
// En uso lo registra el controlador; el pool sigue registrando sus clientes inactivos.
pool.on('connect', conservarErrorCliente);

// Un error en un cliente inactivo del pool (p. ej. PostgreSQL reiniciado) no debe tumbar
// el proceso: el pool descarta ese cliente y abre otro en la siguiente consulta.
pool.on('error', (err) => {
    logError('Error en una conexión inactiva con la base de datos', err);
});

/** Comprueba que la base de datos responde. Devuelve true/false sin lanzar. */
async function checkConnection() {
    try {
        await pool.query('SELECT 1');
        return true;
    } catch (err) {
        logError('No se pudo conectar con la base de datos', err);
        return false;
    }
}

module.exports = pool;
module.exports.checkConnection = checkConnection;
