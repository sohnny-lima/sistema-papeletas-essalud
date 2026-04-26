// responseHandler.js: Manejo de respuestas
const successResponse = (res, data, message = 'Operación exitosa') => {
    res.status(200).json({ success: true, message, data });
};

const errorResponse = (res, error, message = 'Ocurrió un error', statusCode = 500) => {
    console.error(`[Error] ${message}:`, error);
    res.status(statusCode).json({ success: false, message });
};

// Middleware de manejo de errores no controlados
const errorHandler = (err, req, res, next) => {
    console.error('Error inesperado:', err);

    const isDevelopment = process.env.NODE_ENV === 'development';

    const errorResponseBody = {
        success: false,
        message: 'Error inesperado en el servidor',
    };

    // Mostrar detalles del error solo en entorno de desarrollo
    if (isDevelopment) {
        errorResponseBody.details = err.message;
        errorResponseBody.stack = err.stack;
    }

    res.status(500).json(errorResponseBody);
};

module.exports = { successResponse, errorResponse, errorHandler };
