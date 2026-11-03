const { isQueryTimeout } = require('./dbErrors');
// Errores del driver pg sin código: se registra una etiqueta fija, nunca el mensaje original.
// VM1: antes salían como ERROR_INTERNO y no distinguían un tiempo agotado de un corte.
// Mensajes exactos de pg 8.23 / pg-pool 3.14 (r002-2).
const ETIQUETAS_SIN_CODIGO = [
    // pg-pool: la petición esperó una conexión ya existente (pool lleno) más que el límite.
    [/^timeout exceeded when trying to connect$/, 'TIEMPO_CONEXION_AGOTADO'],
    // Apertura de una conexión nueva cortada por el límite (pool o cliente). Es el caso de VM1:
    // tras la inactividad el pool está vacío y abre directamente un cliente nuevo.
    [/^(Connection terminated due to connection timeout|timeout expired)$/, 'TIEMPO_APERTURA_AGOTADO'],
    [/^Connection terminated unexpectedly$/, 'CONEXION_INTERRUMPIDA'],
    [/^Connection terminated$/, 'CONEXION_TERMINADA'],
    [/^Client (has encountered a connection error and is|was closed and is) not queryable$/, 'CONEXION_INTERRUMPIDA'],
];

function etiquetaSinCodigo(error) {
    const mensaje = typeof error?.message === 'string' ? error.message : '';
    const encontrada = ETIQUETAS_SIN_CODIGO.find(([patron]) => patron.test(mensaje));
    return encontrada ? encontrada[1] : 'ERROR_INTERNO';
}

// Solo códigos y metadatos técnicos permitidos: detail/message/where pueden incluir datos personales.
function logError(contexto, error, idPeticion) {
    const codigo = isQueryTimeout(error) ? 'TIEMPO_CONSULTA_AGOTADO' : typeof error?.code === 'string' && /^[A-Z0-9_]{2,40}$/.test(error.code)
        ? error.code : etiquetaSinCodigo(error);
    const metadatos = [];
    for (const campo of ['name', 'table', 'column', 'constraint', 'routine']) {
        const valor = error?.[campo];
        if (typeof valor === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(valor)) metadatos.push(campo + '=' + valor);
    }
    if (typeof idPeticion === 'string' && /^[a-f0-9]{32}$/.test(idPeticion)) metadatos.push('id=' + idPeticion);
    console.error(`${contexto} [${codigo}]${metadatos.length ? ' ' + metadatos.join(' ') : ''}`);
}
module.exports = { logError };
