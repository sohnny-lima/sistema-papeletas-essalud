const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/responseHandler');

// Obtener trabajadores con paginación y filtros
const getAllTrabajadores = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const offset = (page - 1) * pageSize;
    const category = req.query.category || '';
    const filterText = (req.query.filterText || '').trim();

    try {
        let query = 'SELECT * FROM trabajadores';
        let countQuery = 'SELECT COUNT(*) FROM trabajadores';
        const params = [];
        let filterCondition = '';

        const validCategories = [
          'nombres',
          'apellido_paterno',
          'apellido_materno',
          'numero_identificacion'
        ];

        // Aplicar filtro de búsqueda
        if (filterText) {
            if (!validCategories.includes(category)) {
                filterCondition = `
                  WHERE nombres ILIKE $1
                     OR apellido_paterno ILIKE $1
                     OR apellido_materno ILIKE $1
                     OR numero_identificacion ILIKE $1
                `;
            } else {
                filterCondition = ` WHERE ${category} ILIKE $1`;
            }
            params.push(`%${filterText}%`);
        }

        // Query paginada
        const paginatedQuery = `
          ${query}
          ${filterCondition}
          ORDER BY id_trabajador ASC
          LIMIT $${params.length + 1}
          OFFSET $${params.length + 2}
        `;
        params.push(pageSize, offset);

        // Para el conteo total
        const countParams = filterCondition ? [params[0]] : [];
        const totalCountResult = await pool.query(countQuery + filterCondition, countParams);
        const totalItems = parseInt(totalCountResult.rows[0].count);

        const result = await pool.query(paginatedQuery, params);

        // Retornamos la respuesta
        return successResponse(res, {
            data: result.rows, // el array real de trabajadores
            totalItems,
            totalPages: Math.ceil(totalItems / pageSize),
            currentPage: page
        }, 'Trabajadores obtenidos exitosamente');
    } catch (error) {
        console.error('Error al obtener los trabajadores:', error);
        return errorResponse(res, error, 'Error al obtener los trabajadores');
    }
};

// Obtener un trabajador por ID
const getTrabajadorById = async (req, res) => {
    const id = req.params.id;

    try {
        const result = await pool.query('SELECT * FROM trabajadores WHERE id_trabajador = $1', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Trabajador no encontrado.' });
        }

        successResponse(res, result.rows[0], 'Trabajador obtenido exitosamente');
    } catch (error) {
        console.error('Error al obtener el trabajador:', error);
        errorResponse(res, error, 'Error al obtener el trabajador');
    }
};

// Crear un nuevo trabajador
const createTrabajador = async (req, res) => {
    const nombres = normalizeText(req.body.nombres);
    const apellido_paterno = normalizeText(req.body.apellido_paterno);
    const apellido_materno = normalizeText(req.body.apellido_materno);
    const numero_identificacion = normalizeText(req.body.numero_identificacion);

    if (!nombres || !apellido_paterno || !apellido_materno || !numero_identificacion) {
        return res.status(400).json({ success: false, message: 'Todos los campos son obligatorios.' });
    }

    try {
        const query = `
            INSERT INTO trabajadores (nombres, apellido_paterno, apellido_materno, numero_identificacion)
            VALUES ($1, $2, $3, $4) RETURNING *
        `;
        const result = await pool.query(query, [nombres, apellido_paterno, apellido_materno, numero_identificacion]);

        successResponse(res, result.rows[0], 'Trabajador creado exitosamente');
    } catch (error) {
        console.error('Error al crear el trabajador:', error);
        errorResponse(res, error, 'Error al crear el trabajador');
    }
};

// Actualizar un trabajador existente
const updateTrabajador = async (req, res) => {
    const id = req.params.id;
    const nombres = normalizeText(req.body.nombres);
    const apellido_paterno = normalizeText(req.body.apellido_paterno);
    const apellido_materno = normalizeText(req.body.apellido_materno);
    const numero_identificacion = normalizeText(req.body.numero_identificacion);

    if (!nombres || !apellido_paterno || !apellido_materno || !numero_identificacion) {
        return res.status(400).json({ success: false, message: 'Todos los campos son obligatorios.' });
    }

    try {
        const query = `
            UPDATE trabajadores 
            SET nombres = $1, apellido_paterno = $2, apellido_materno = $3, numero_identificacion = $4
            WHERE id_trabajador = $5 RETURNING *
        `;
        const result = await pool.query(query, [nombres, apellido_paterno, apellido_materno, numero_identificacion, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Trabajador no encontrado.' });
        }

        successResponse(res, result.rows[0], 'Trabajador actualizado exitosamente');
    } catch (error) {
        console.error('Error al actualizar el trabajador:', error);
        errorResponse(res, error, 'Error al actualizar el trabajador');
    }
};

// Eliminar un trabajador
const deleteTrabajador = async (req, res) => {
    const id = req.params.id;

    try {
        const result = await pool.query('DELETE FROM trabajadores WHERE id_trabajador = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Trabajador no encontrado.' });
        }

        successResponse(res, result.rows[0], 'Trabajador eliminado correctamente');
    } catch (error) {
        console.error('Error al eliminar el trabajador:', error);
        errorResponse(res, error, 'Error al eliminar el trabajador');
    }
};

module.exports = {
    getAllTrabajadores,
    getTrabajadorById,
    createTrabajador,
    updateTrabajador,
    deleteTrabajador
};

function normalizeText(value) {
    return String(value || '').trim().toUpperCase();
}
