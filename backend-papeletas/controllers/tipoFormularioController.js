const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/responseHandler');

// Obtener todos los tipos de formulario
const getAllTiposFormulario = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tipo_formulario ORDER BY id_tipo_formulario ASC');
        successResponse(res, result.rows, 'Tipos de formulario obtenidos exitosamente');
    } catch (error) {
        console.error('Error al obtener los tipos de formulario:', error);
        errorResponse(res, error, 'Error al obtener los tipos de formulario');
    }
};

// Obtener un tipo de formulario por ID
const getTipoFormularioById = async (req, res) => {
    const id = req.params.id;

    try {
        const result = await pool.query('SELECT * FROM tipo_formulario WHERE id_tipo_formulario = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Tipo de formulario no encontrado.' });
        }
        successResponse(res, result.rows[0], 'Tipo de formulario obtenido exitosamente');
    } catch (error) {
        console.error('Error al obtener el tipo de formulario:', error);
        errorResponse(res, error, 'Error al obtener el tipo de formulario');
    }
};

// Crear un nuevo tipo de formulario
const createTipoFormulario = async (req, res) => {
    const { nombre } = req.body;

    if (!nombre) {
        return res.status(400).json({ success: false, message: 'El nombre del tipo de formulario es obligatorio.' });
    }

    try {
        const query = 'INSERT INTO tipo_formulario (nombre) VALUES ($1) RETURNING *';
        const result = await pool.query(query, [nombre]);

        successResponse(res, result.rows[0], 'Tipo de formulario creado exitosamente');
    } catch (error) {
        console.error('Error al crear el tipo de formulario:', error);
        errorResponse(res, error, 'Error al crear el tipo de formulario');
    }
};

// Actualizar un tipo de formulario existente
const updateTipoFormulario = async (req, res) => {
    const id = req.params.id;
    const { nombre } = req.body;

    if (!nombre) {
        return res.status(400).json({ success: false, message: 'El nombre del tipo de formulario es obligatorio.' });
    }

    try {
        const query = 'UPDATE tipo_formulario SET nombre = $1 WHERE id_tipo_formulario = $2 RETURNING *';
        const result = await pool.query(query, [nombre, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Tipo de formulario no encontrado.' });
        }

        successResponse(res, result.rows[0], 'Tipo de formulario actualizado exitosamente');
    } catch (error) {
        console.error('Error al actualizar el tipo de formulario:', error);
        errorResponse(res, error, 'Error al actualizar el tipo de formulario');
    }
};

// Eliminar un tipo de formulario
const deleteTipoFormulario = async (req, res) => {
    const id = req.params.id;

    try {
        const query = 'DELETE FROM tipo_formulario WHERE id_tipo_formulario = $1 RETURNING *';
        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Tipo de formulario no encontrado.' });
        }

        successResponse(res, result.rows[0], 'Tipo de formulario eliminado exitosamente');
    } catch (error) {
        console.error('Error al eliminar el tipo de formulario:', error);
        errorResponse(res, error, 'Error al eliminar el tipo de formulario');
    }
};

module.exports = {
    getAllTiposFormulario,
    getTipoFormularioById,
    createTipoFormulario,
    updateTipoFormulario,
    deleteTipoFormulario,
};
