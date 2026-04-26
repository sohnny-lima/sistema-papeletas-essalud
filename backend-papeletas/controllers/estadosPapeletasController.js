const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/responseHandler');

// Obtener todos los estados de papeletas
const getAllEstados = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM estados_papeletas ORDER BY id_estado ASC');
        successResponse(res, result.rows, 'Estados de papeletas obtenidos exitosamente');
    } catch (error) {
        console.error('Error al obtener los estados de papeletas:', error);
        errorResponse(res, error, 'Error al obtener los estados de papeletas');
    }
};

// Obtener un estado de papeleta por ID
const getEstadoById = async (req, res) => {
    const id = req.params.id;

    try {
        const result = await pool.query('SELECT * FROM estados_papeletas WHERE id_estado = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Estado de papeleta no encontrado.' });
        }
        successResponse(res, result.rows[0], 'Estado de papeleta obtenido exitosamente');
    } catch (error) {
        console.error('Error al obtener el estado de papeleta:', error);
        errorResponse(res, error, 'Error al obtener el estado de papeleta');
    }
};

// Crear un nuevo estado de papeleta
const createEstado = async (req, res) => {
    const { nombre_estado } = req.body;

    if (!nombre_estado) {
        return res.status(400).json({ success: false, message: 'El nombre del estado es obligatorio.' });
    }

    try {
        const query = 'INSERT INTO estados_papeletas (nombre_estado) VALUES ($1) RETURNING *';
        const result = await pool.query(query, [nombre_estado]);

        successResponse(res, result.rows[0], 'Estado de papeleta creado exitosamente');
    } catch (error) {
        console.error('Error al crear el estado de papeleta:', error);
        errorResponse(res, error, 'Error al crear el estado de papeleta');
    }
};

// Actualizar un estado de papeleta existente
const updateEstado = async (req, res) => {
    const id = req.params.id;
    const { nombre_estado } = req.body;

    if (!nombre_estado) {
        return res.status(400).json({ success: false, message: 'El nombre del estado es obligatorio.' });
    }

    try {
        const query = 'UPDATE estados_papeletas SET nombre_estado = $1 WHERE id_estado = $2 RETURNING *';
        const result = await pool.query(query, [nombre_estado, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Estado de papeleta no encontrado.' });
        }

        successResponse(res, result.rows[0], 'Estado de papeleta actualizado exitosamente');
    } catch (error) {
        console.error('Error al actualizar el estado de papeleta:', error);
        errorResponse(res, error, 'Error al actualizar el estado de papeleta');
    }
};

// Eliminar un estado de papeleta
const deleteEstado = async (req, res) => {
    const id = req.params.id;

    try {
        const result = await pool.query('DELETE FROM estados_papeletas WHERE id_estado = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Estado de papeleta no encontrado.' });
        }

        successResponse(res, result.rows[0], 'Estado de papeleta eliminado exitosamente');
    } catch (error) {
        console.error('Error al eliminar el estado de papeleta:', error);
        errorResponse(res, error, 'Error al eliminar el estado de papeleta');
    }
};

module.exports = {
    getAllEstados,
    getEstadoById,
    createEstado,
    updateEstado,
    deleteEstado,
};
