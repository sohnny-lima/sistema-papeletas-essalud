const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../config/database'); // Conexión a la base de datos

const login = async (req, res) => {
    const { nombreUsuario, contrasena } = req.body;

    // Validación básica de los datos de entrada
    if (!nombreUsuario || !contrasena) {
        return res.status(400).json({
            success: false,
            message: 'El nombre de usuario y la contraseña son requeridos.',
        });
    }

    try {
        // Buscar el usuario en la base de datos
        const query = 'SELECT * FROM usuarios WHERE nombre_usuario = $1';
        const result = await pool.query(query, [nombreUsuario]);

        // Verificar si el usuario existe
        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Credenciales incorrectas. Usuario no encontrado.',
            });
        }

        const usuario = result.rows[0];

        // Verificar la contraseña
        const validPassword = await bcrypt.compare(contrasena, usuario.contrasena);
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                message: 'Credenciales incorrectas. Contraseña inválida.',
            });
        }

        // Crear el token JWT
        const token = jwt.sign(
            {
                idUsuario: usuario.id_usuario,
                nombreUsuario: usuario.nombre_usuario,
                rol: usuario.id_rol === 1 ? 'admin' : 'user', // Diferenciar roles
            },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        // Respuesta exitosa
        return res.status(200).json({
            success: true,
            message: 'Autenticación exitosa',
            token: token,
            user: {
                idUsuario: usuario.id_usuario,
                nombreUsuario: usuario.nombre_usuario,
                rol: usuario.id_rol === 1 ? 'admin' : 'user',
            },
        });
    } catch (error) {
        console.error('Error al autenticar:', error);

        // Manejo genérico de errores
        return res.status(500).json({
            success: false,
            message: 'Error interno del servidor. Por favor, inténtelo más tarde.',
        });
    }
};

module.exports = { login };
