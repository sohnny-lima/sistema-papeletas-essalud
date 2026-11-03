// Traduce errores de PostgreSQL / del driver pg a un estado HTTP y un motivo legible.

const CONNECTION_ERROR_CODES = new Set([
    'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'EPIPE',
]);

function isQueryTimeout(error) {
    return error?.code === '57014' || error?.code === '25P03' || error?.message === 'Query read timeout';
}

function isConnectionError(error) {
    if (!error) return false;
    if (CONNECTION_ERROR_CODES.has(error.code)) return true;
    // AggregateError (IPv4 + IPv6) que lanza net al no poder conectar
    if (Array.isArray(error.errors) && error.errors.some(isConnectionError)) return true;
    // Clase 08 (connection exception) y 57P0x (servidor apagándose / no disponible)
    // Clase 53 (recursos insuficientes, p. ej. 53300 too_many_connections)
    if (typeof error.code === 'string' && (/^08/.test(error.code) || /^57P0/.test(error.code) || /^53/.test(error.code))) return true;
    if (/^Client (has encountered a connection error and is|was closed and is) not queryable$/.test(error.message || '')) return true;
    // r002-2: «timeout expired» es el límite de apertura del cliente pg (exacto, sin code).
    return /timeout exceeded when trying to connect|Connection terminated|^timeout expired$/i.test(error.message || '');
}

/**
 * Devuelve estado y motivo para errores conocidos; el contexto puede fijar un mensaje contractual.
 */
function mapDbError(error, contexto) {
    if (!error) return null;
    if (isQueryTimeout(error)) {
        return { status: 503, reason: 'La base de datos tardó demasiado en responder. Inténtelo más tarde.' };
    }
    if (isConnectionError(error)) {
        return { status: 503, reason: 'La base de datos no está disponible en este momento. Inténtelo más tarde.' };
    }
    switch (error.code) {
        case '22P02': // invalid_text_representation (p. ej. id "abc" en una columna entera)
        case '22003': // numeric_value_out_of_range
            return { status: 400, reason: 'Algún identificador o valor numérico no es válido.' };
        case '22007': // invalid_datetime_format
        case '22008': // datetime_field_overflow
            return { status: 400, reason: 'La fecha indicada no es válida.' };
        case '22001': // string_data_right_truncation (texto más largo que la columna)
        case '22021': // character_not_in_repertoire (p. ej. byte nulo)
            return { status: 400, reason: 'Algún texto supera la longitud máxima o contiene caracteres no válidos.' };
        case '23502': // not_null_violation
            return { status: 400, reason: 'Falta un dato obligatorio.' };
        case '23503': // foreign_key_violation
            if (contexto === 'usuarios') return { status: 400, message: 'El rol no existe.' };
            return { status: 409, reason: 'El registro está relacionado con otros datos (referencia inexistente o en uso).' };
        case '23505': // unique_violation
            if (contexto === 'usuarios') return { status: 409, message: 'Ya existe un usuario con ese nombre.' };
            return { status: 409, reason: 'Ya existe un registro con ese valor único.' };
        default:
            return null;
    }
}

module.exports = { mapDbError, isConnectionError, isQueryTimeout };
