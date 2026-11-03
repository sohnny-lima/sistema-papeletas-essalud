// responseHandler.js: Manejo de respuestas
const { logError } = require('./securityLog');
const { mapDbError } = require('./dbErrors');

const successResponse = (res, data, message = 'Operación exitosa') => {
    res.status(200).json({ success: true, message, data });
};

/**
 * Responde un error. Si no se indica statusCode y el error es de PostgreSQL reconocible
 * (base caída, FK, único, tipo inválido…), se usa el estado adecuado y se añade el motivo.
 * Un contexto de BD puede fijar el mensaje exacto del contrato. Sin error técnico
 * (null), responde una validación controlada sin generar un registro de error.
 */
const errorResponse = (res, error, message = 'Ocurrió un error', statusCode, contextoDb) => {
    if (error) logError(message, error, res.locals?.idPeticion);
    let status = statusCode || 500;
    let finalMessage = message;

    if (!statusCode) {
        const mapped = mapDbError(error, contextoDb);
        if (mapped) {
            status = mapped.status;
            finalMessage = mapped.message || `${message}. ${mapped.reason}`;
        }
    }

    if (res.headersSent) return;
    res.status(status).json({ success: false, message: finalMessage });
};

// Middleware de manejo de errores no controlados
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
    // Cuerpo JSON mal formado (body-parser)
    if (err && err.type === 'entity.parse.failed') {
        return res.status(400).json({ success: false, message: 'El cuerpo de la petición no es un JSON válido.' });
    }
    if (err && err.type === 'entity.too.large') {
        return res.status(413).json({ success: false, message: 'El cuerpo de la petición es demasiado grande.' });
    }

    logError('Error inesperado', err, res.locals?.idPeticion);

    const errorResponseBody = {
        success: false,
        message: 'Error inesperado en el servidor',
    };

    const mapped = mapDbError(err);
    if (mapped) errorResponseBody.message = mapped.message || mapped.reason;
    if (res.headersSent) return next(err);
    res.status(mapped?.status || 500).json(errorResponseBody);
};

module.exports = { successResponse, errorResponse, errorHandler };
