const { isQueryTimeout, isConnectionError } = require('./dbErrors');
const { logError } = require('./securityLog');
// Utilidades para transacciones con un cliente del pool (pool.connect()).

// Conexiones cuyo ROLLBACK falló: se descartan en lugar de devolverlas al pool.
const brokenClients = new WeakSet();

/** ROLLBACK que nunca lanza (la conexión puede estar rota). */
async function safeRollback(client, error) {
  if (isQueryTimeout(error) || isConnectionError(error)) brokenClients.add(client);
  // Sin respuesta del cliente no se puede encolar otro comando: el cierre de la
  // conexión revierte la transacción en PostgreSQL y evita otro plazo de espera.
  if (error?.message === 'Query read timeout' || error?.code === '25P03' || isConnectionError(error)) return;
  try {
    await client.query('ROLLBACK');
  } catch (rollbackError) {
    brokenClients.add(client);
    logError('Error al hacer ROLLBACK', rollbackError);
  }
}

/** Devuelve el cliente al pool, o lo descarta si quedó roto. */
function releaseClient(client) {
  if (client) client.release(brokenClients.has(client));
}

module.exports = { safeRollback, releaseClient };
