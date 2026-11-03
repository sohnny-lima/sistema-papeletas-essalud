const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { rolDesdeId } = require('../utils/roles');
const { esIdValido } = require('../utils/idValidation');
const { errorResponse } = require('../utils/responseHandler');

// U2: la firma y la versión autorizan la sesión; el rol vigente lo decide la base.
const verifyToken = async (req, res, next) => {
    let decoded;
    const invalida = () => errorResponse(res, null, 'Su sesión ya no es válida. Inicie sesión de nuevo.', 401);
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return errorResponse(res, null, 'Token no proporcionado o formato incorrecto.', 401);
    }
    try {
        decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch (error) {
        return errorResponse(res, null, 'Token inválido o expirado.', 401);
    }
    if (!Number.isInteger(decoded.ver) || decoded.ver < 0 || !Number.isInteger(decoded.idUsuario) || !esIdValido(decoded.idUsuario)) return invalida();
    try {
        const result = await pool.query('SELECT id_usuario, nombre_usuario, id_rol, activo, version_sesion FROM usuarios WHERE id_usuario = $1', [decoded.idUsuario]);
        const usuario = result.rows[0];
        if (!usuario || !usuario.activo || usuario.version_sesion !== decoded.ver) return invalida();
        req.usuario = { ...decoded, idUsuario: usuario.id_usuario, nombreUsuario: usuario.nombre_usuario,
            rol: rolDesdeId(usuario.id_rol) };
    } catch (error) {
        return errorResponse(res, error, 'No se pudo verificar la sesión');
    }
    // Una petición ya autorizada termina aunque otra invalide después la sesión.
    return next();
};

// Middleware para verificar si el usuario tiene un rol específico
const verifyRole = (requiredRole) => (req, res, next) => {
    try {
        const { rol } = req.usuario;

        if (rol !== requiredRole) {
            return errorResponse(res, null, `Acceso denegado. Se requiere el rol de ${requiredRole}.`, 403);
        }

        next();
    } catch (error) {
        return errorResponse(res, null, 'No tienes los permisos necesarios.', 403);
    }
};

// Middleware específico para verificar si el usuario es administrador
const verifyAdmin = verifyRole('admin');

module.exports = { verifyToken, verifyRole, verifyAdmin };
