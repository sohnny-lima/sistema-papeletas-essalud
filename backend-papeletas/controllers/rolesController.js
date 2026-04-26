const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/responseHandler');

// Obtener todos los roles
const getAllRoles = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM roles ORDER BY id_rol ASC');
        successResponse(res, result.rows, 'Roles obtenidos exitosamente');
    } catch (error) {
        console.error('Error al obtener los roles:', error);
        errorResponse(res, error, 'Error al obtener los roles');
    }
};

// Obtener un rol por ID
const getRolById = async (req, res) => {
    const id = req.params.id;

    try {
        const result = await pool.query('SELECT * FROM roles WHERE id_rol = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Rol no encontrado.' });
        }
        successResponse(res, result.rows[0], 'Rol obtenido exitosamente');
    } catch (error) {
        console.error('Error al obtener el rol:', error);
        errorResponse(res, error, 'Error al obtener el rol');
    }
};

// Crear un nuevo rol
const createRol = async (req, res) => {
    const { nombre_rol } = req.body;

    if (!nombre_rol) {
        return res.status(400).json({ success: false, message: 'El nombre del rol es obligatorio.' });
    }

    try {
        const query = 'INSERT INTO roles (nombre_rol) VALUES ($1) RETURNING *';
        const result = await pool.query(query, [nombre_rol]);

        successResponse(res, result.rows[0], 'Rol creado exitosamente');
    } catch (error) {
        console.error('Error al crear el rol:', error);
        errorResponse(res, error, 'Error al crear el rol');
    }
};

// Actualizar un rol existente
const updateRol = async (req, res) => {
    const id = req.params.id;
    const { nombre_rol } = req.body;

    if (!nombre_rol) {
        return res.status(400).json({ success: false, message: 'El nombre del rol es obligatorio.' });
    }

    try {
        const query = 'UPDATE roles SET nombre_rol = $1 WHERE id_rol = $2 RETURNING *';
        const result = await pool.query(query, [nombre_rol, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Rol no encontrado.' });
        }

        successResponse(res, result.rows[0], 'Rol actualizado exitosamente');
    } catch (error) {
        console.error('Error al actualizar el rol:', error);
        errorResponse(res, error, 'Error al actualizar el rol');
    }
};

// Eliminar un rol
const deleteRol = async (req, res) => {
    const id = req.params.id;

    try {
        const query = 'DELETE FROM roles WHERE id_rol = $1 RETURNING *';
        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Rol no encontrado.' });
        }

        successResponse(res, result.rows[0], 'Rol eliminado exitosamente');
    } catch (error) {
        console.error('Error al eliminar el rol:', error);
        errorResponse(res, error, 'Error al eliminar el rol');
    }
};

module.exports = {
    getAllRoles,
    getRolById,
    createRol,
    updateRol,
    deleteRol,
};
