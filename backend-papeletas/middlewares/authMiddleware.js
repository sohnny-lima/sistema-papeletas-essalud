const jwt = require('jsonwebtoken');

// Middleware para verificar si el usuario tiene un token válido
const verifyToken = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Token no proporcionado o formato incorrecto.',
            });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Guardar la información decodificada del usuario en el objeto de la solicitud
        req.usuario = decoded;
        next();
    } catch (error) {
        console.error('Error al verificar el token:', error.message);
        res.status(401).json({
            success: false,
            message: 'Token inválido o expirado.',
        });
    }
};

// Middleware para verificar si el usuario tiene un rol específico
const verifyRole = (requiredRole) => (req, res, next) => {
    try {
        const { rol } = req.usuario;

        if (rol !== requiredRole) {
            return res.status(403).json({
                success: false,
                message: `Acceso denegado. Se requiere el rol de ${requiredRole}.`,
            });
        }

        next();
    } catch (error) {
        console.error('Error al verificar el rol:', error.message);
        res.status(403).json({
            success: false,
            message: 'No tienes los permisos necesarios.',
        });
    }
};

// Middleware específico para verificar si el usuario es administrador
const verifyAdmin = verifyRole('admin');

module.exports = { verifyToken, verifyRole, verifyAdmin };
