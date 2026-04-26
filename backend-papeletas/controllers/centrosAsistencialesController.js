const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/responseHandler');

// Obtener todos los centros asistenciales
const getAllCentros = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM centros_asistenciales ORDER BY id_centro ASC');
        successResponse(res, result.rows, 'Centros asistenciales obtenidos exitosamente');
    } catch (error) {
        console.error('Error al obtener los centros asistenciales:', error);
        errorResponse(res, error, 'Error al obtener los centros asistenciales');
    }
};

// Obtener un centro asistencial por ID
const getCentroById = async (req, res) => {
    const id = req.params.id;

    try {
        const result = await pool.query('SELECT * FROM centros_asistenciales WHERE id_centro = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Centro asistencial no encontrado.' });
        }
        successResponse(res, result.rows[0], 'Centro asistencial obtenido exitosamente');
    } catch (error) {
        console.error('Error al obtener el centro asistencial:', error);
        errorResponse(res, error, 'Error al obtener el centro asistencial');
    }
};

// Crear un nuevo centro asistencial
const createCentro = async (req, res) => {
    const { nombre_centro } = req.body;

    if (!nombre_centro) {
        return res.status(400).json({ success: false, message: 'El nombre del centro asistencial es obligatorio.' });
    }

    try {
        const query = 'INSERT INTO centros_asistenciales (nombre_centro) VALUES ($1) RETURNING *';
        const result = await pool.query(query, [nombre_centro]);

        successResponse(res, result.rows[0], 'Centro asistencial creado exitosamente');
    } catch (error) {
        console.error('Error al crear el centro asistencial:', error);
        errorResponse(res, error, 'Error al crear el centro asistencial');
    }
};

// Actualizar un centro asistencial existente
const updateCentro = async (req, res) => {
    const id = req.params.id;
    const { nombre_centro } = req.body;

    if (!nombre_centro) {
        return res.status(400).json({ success: false, message: 'El nombre del centro asistencial es obligatorio.' });
    }

    try {
        const query = 'UPDATE centros_asistenciales SET nombre_centro = $1 WHERE id_centro = $2 RETURNING *';
        const result = await pool.query(query, [nombre_centro, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Centro asistencial no encontrado.' });
        }

        successResponse(res, result.rows[0], 'Centro asistencial actualizado exitosamente');
    } catch (error) {
        console.error('Error al actualizar el centro asistencial:', error);
        errorResponse(res, error, 'Error al actualizar el centro asistencial');
    }
};

// Eliminar un centro asistencial
const deleteCentro = async (req, res) => {
    const id = req.params.id;

    try {
        const result = await pool.query('DELETE FROM centros_asistenciales WHERE id_centro = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Centro asistencial no encontrado.' });
        }

        successResponse(res, result.rows[0], 'Centro asistencial eliminado exitosamente');
    } catch (error) {
        console.error('Error al eliminar el centro asistencial:', error);
        errorResponse(res, error, 'Error al eliminar el centro asistencial');
    }
};

module.exports = {
    getAllCentros,
    getCentroById,
    createCentro,
    updateCentro,
    deleteCentro,
};
