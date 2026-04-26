const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/responseHandler');

// Obtener estadísticas generales
const getEstadisticas = async (req, res) => {
    try {
        const totalTrabajadores = await pool.query('SELECT COUNT(*) FROM trabajadores');
        const totalEquipos = await pool.query('SELECT COUNT(*) FROM equipos');
        const totalPapeletas = await pool.query('SELECT COUNT(*) FROM papeletas');

        successResponse(res, {
            trabajadores: parseInt(totalTrabajadores.rows[0].count),
            equipos: parseInt(totalEquipos.rows[0].count),
            papeletas: parseInt(totalPapeletas.rows[0].count),
        }, 'Estadísticas obtenidas exitosamente');
    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        errorResponse(res, error, 'Error al obtener estadísticas');
    }
};

module.exports = { getEstadisticas };
