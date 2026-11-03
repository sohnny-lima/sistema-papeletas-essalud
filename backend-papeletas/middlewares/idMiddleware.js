const { esIdValido } = require('../utils/idValidation');
const { errorResponse } = require('../utils/responseHandler');

function validateId(req, res, next, valor) {
    if (!esIdValido(valor)) {
        return errorResponse(res, null, 'El id debe ser un entero positivo válido.', 400);
    }
    next();
}
module.exports = { validateId };
