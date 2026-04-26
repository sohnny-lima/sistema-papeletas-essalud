const pool = require('../config/database');
const bcrypt = require('bcrypt');
const { successResponse, errorResponse } = require('../utils/responseHandler');

// Obtener todos los usuarios
const getAllUsuarios = async (req, res) => {
    try {
        const query = `
            SELECT u.id_usuario, u.nombre_usuario, r.nombre_rol
            FROM usuarios u
            JOIN roles r ON u.id_rol = r.id_rol
            ORDER BY u.id_usuario ASC;
        `;
        const result = await pool.query(query);
        successResponse(res, result.rows, 'Usuarios obtenidos exitosamente');
    } catch (error) {
        console.error('Error al obtener los usuarios:', error);
        errorResponse(res, error, 'Error al obtener los usuarios');
    }
};

// Obtener un usuario por ID
const getUsuarioById = async (req, res) => {
    const id = req.params.id;

    try {
        const query = `
            SELECT u.id_usuario, u.nombre_usuario, r.nombre_rol
            FROM usuarios u
            JOIN roles r ON u.id_rol = r.id_rol
            WHERE u.id_usuario = $1;
        `;
        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
        }

        successResponse(res, result.rows[0], 'Usuario obtenido exitosamente');
    } catch (error) {
        console.error('Error al obtener el usuario:', error);
        errorResponse(res, error, 'Error al obtener el usuario');
    }
};

// Crear un nuevo usuario
const createUsuario = async (req, res) => {
    const { nombre_usuario, contrasena, id_rol } = req.body;

    if (!nombre_usuario || !contrasena || !id_rol) {
        return res.status(400).json({ success: false, message: 'Todos los campos son obligatorios.' });
    }

    try {
        // Encriptar la contraseña
        const hashedPassword = await bcrypt.hash(contrasena, 10);

        const query = `
            INSERT INTO usuarios (nombre_usuario, contrasena, id_rol) 
            VALUES ($1, $2, $3) RETURNING id_usuario, nombre_usuario, id_rol;
        `;
        const result = await pool.query(query, [nombre_usuario, hashedPassword, id_rol]);

        successResponse(res, result.rows[0], 'Usuario creado exitosamente');
    } catch (error) {
        console.error('Error al crear el usuario:', error);
        errorResponse(res, error, 'Error al crear el usuario');
    }
};

// Actualizar un usuario existente
const updateUsuario = async (req, res) => {
    const id = req.params.id;
    const { nombre_usuario, contrasena, id_rol } = req.body;

    if (!nombre_usuario || !id_rol) {
        return res.status(400).json({ success: false, message: 'El nombre de usuario y el rol son obligatorios.' });
    }

    try {
        let query = 'UPDATE usuarios SET nombre_usuario = $1, id_rol = $2';
        const params = [nombre_usuario, id_rol];

        if (contrasena) {
            const hashedPassword = await bcrypt.hash(contrasena, 10);
            query += ', contrasena = $3';
            params.push(hashedPassword);
        }

        params.push(id);
        query += ` WHERE id_usuario = $${params.length} RETURNING id_usuario, nombre_usuario, id_rol`;

        const result = await pool.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
        }

        successResponse(res, result.rows[0], 'Usuario actualizado exitosamente');
    } catch (error) {
        console.error('Error al actualizar el usuario:', error);
        errorResponse(res, error, 'Error al actualizar el usuario');
    }
};

// Eliminar un usuario
const deleteUsuario = async (req, res) => {
    const id = req.params.id;

    try {
        const query = 'DELETE FROM usuarios WHERE id_usuario = $1 RETURNING id_usuario, nombre_usuario';
        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
        }

        successResponse(res, result.rows[0], 'Usuario eliminado exitosamente');
    } catch (error) {
        console.error('Error al eliminar el usuario:', error);
        errorResponse(res, error, 'Error al eliminar el usuario');
    }
};

module.exports = {
    getAllUsuarios,
    getUsuarioById,
    createUsuario,
    updateUsuario,
    deleteUsuario,
};
