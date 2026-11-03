const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../config/database'); // Conexión a la base de datos
const HASH_FICTICIO = bcrypt.hashSync(require('node:crypto').randomBytes(32).toString('hex'), 10);
const { rolDesdeId, nombreRol } = require('../utils/roles');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const { isConnectionError, isQueryTimeout, mapDbError } = require('../utils/dbErrors');

const login = async (req, res) => {
    const { nombreUsuario, contrasena } = req.body || {};

    // Validación básica de los datos de entrada (bcrypt exige texto)
    if (!nombreUsuario || !contrasena || typeof nombreUsuario !== 'string' || typeof contrasena !== 'string') {
        return errorResponse(res, null, 'El nombre de usuario y la contraseña son requeridos.', 400);
    }

    try {
        // Buscar el usuario en la base de datos
        const query = 'SELECT id_usuario, nombre_usuario, contrasena, id_rol, activo, version_sesion FROM usuarios WHERE lower(nombre_usuario) = lower($1)';
        const result = await pool.query(query, [nombreUsuario]);

        const usuario = result.rows[0];
        // También se realiza bcrypt si no existe: mismo trabajo costoso y mismo mensaje.
        const validPassword = await bcrypt.compare(contrasena, usuario?.contrasena || HASH_FICTICIO);
        if (!usuario || !validPassword) {
            return errorResponse(res, null, 'Usuario o contraseña incorrectos.', 401);
        }

        if (!usuario.activo) {
            return errorResponse(res, null, 'La cuenta está desactivada. Contacte con un administrador.', 403);
        }

        const rol = rolDesdeId(usuario.id_rol);
        // Crear el token JWT
        const token = jwt.sign(
            {
                ver: usuario.version_sesion,
                idUsuario: usuario.id_usuario,
                nombreUsuario: usuario.nombre_usuario,
                rol,
            },
            process.env.JWT_SECRET,
            { algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
        );

        // Respuesta exitosa
        return res.status(200).json({
            success: true,
            message: 'Autenticación exitosa',
            token: token,
            user: {
                idUsuario: usuario.id_usuario,
                nombreUsuario: usuario.nombre_usuario,
                rol,
            },
        });
    } catch (error) {
        if (isQueryTimeout(error)) {
            return errorResponse(res, error, mapDbError(error).reason, 503);
        }
        if (isConnectionError(error)) {
            return errorResponse(res, error, 'La base de datos no está disponible en este momento. Inténtelo más tarde.', 503);
        }
        return errorResponse(res, error, 'Error interno del servidor. Por favor, inténtelo más tarde.', 500);
    }
};

const sesion = (req, res) => {
    const { idUsuario, nombreUsuario, rol } = req.usuario;
    return successResponse(res, { idUsuario, nombreUsuario, rol,
        rolNombre: nombreRol(rol) }, 'Sesión vigente');
};
module.exports = { login, sesion };
