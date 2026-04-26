const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/responseHandler');

// Obtener todos los movimientos con datos relacionados
const getAllMovimientos = async (req, res) => {
    try {
        const query = `
            SELECT p.id_papeleta, 
                   p.fecha, 
                   p.motivo, 
                   p.observaciones, 
                   t_origen.nombres || ' ' || t_origen.apellido_paterno AS trabajador_origen,
                   t_destino.nombres || ' ' || t_destino.apellido_paterno AS trabajador_destino,
                   l_origen.nombre_ambiente AS lugar_origen,
                   l_destino.nombre_ambiente AS lugar_destino
            FROM papeletas p
            LEFT JOIN trabajadores t_origen ON p.id_trabajador_origen = t_origen.id_trabajador
            LEFT JOIN trabajadores t_destino ON p.id_trabajador_destino = t_destino.id_trabajador
            LEFT JOIN lugares l_origen ON p.id_lugar_origen = l_origen.id_lugar
            LEFT JOIN lugares l_destino ON p.id_lugar_destino = l_destino.id_lugar
            ORDER BY p.fecha DESC;
        `;
        const result = await pool.query(query);

        successResponse(res, result.rows, 'Movimientos obtenidos exitosamente');
    } catch (error) {
        console.error('Error al obtener los movimientos:', error);
        errorResponse(res, error, 'Error al obtener los movimientos');
    }
};

// Obtener movimientos filtrados por fechas, trabajadores, o lugares
const getFilteredMovimientos = async (req, res) => {
    const { fechaInicio, fechaFin, trabajador, lugar } = req.query;

    try {
        let query = `
            SELECT p.id_papeleta, 
                   p.fecha, 
                   p.motivo, 
                   p.observaciones, 
                   t_origen.nombres || ' ' || t_origen.apellido_paterno AS trabajador_origen,
                   t_destino.nombres || ' ' || t_destino.apellido_paterno AS trabajador_destino,
                   l_origen.nombre_ambiente AS lugar_origen,
                   l_destino.nombre_ambiente AS lugar_destino
            FROM papeletas p
            LEFT JOIN trabajadores t_origen ON p.id_trabajador_origen = t_origen.id_trabajador
            LEFT JOIN trabajadores t_destino ON p.id_trabajador_destino = t_destino.id_trabajador
            LEFT JOIN lugares l_origen ON p.id_lugar_origen = l_origen.id_lugar
            LEFT JOIN lugares l_destino ON p.id_lugar_destino = l_destino.id_lugar
        `;
        const conditions = [];
        const params = [];

        if (fechaInicio && fechaFin) {
            conditions.push('p.fecha BETWEEN $1 AND $2');
            params.push(fechaInicio, fechaFin);
        }

        if (trabajador) {
            conditions.push('(t_origen.nombres ILIKE $3 OR t_destino.nombres ILIKE $3)');
            params.push(`%${trabajador}%`);
        }

        if (lugar) {
            conditions.push('(l_origen.nombre_ambiente ILIKE $4 OR l_destino.nombre_ambiente ILIKE $4)');
            params.push(`%${lugar}%`);
        }

        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }

        query += ' ORDER BY p.fecha DESC';

        const result = await pool.query(query, params);

        successResponse(res, result.rows, 'Movimientos filtrados obtenidos exitosamente');
    } catch (error) {
        console.error('Error al filtrar los movimientos:', error);
        errorResponse(res, error, 'Error al filtrar los movimientos');
    }
};

// Obtener un movimiento específico por ID de papeleta
const getMovimientoById = async (req, res) => {
    const id = req.params.id;

    try {
        const query = `
            SELECT p.id_papeleta, 
                   p.fecha, 
                   p.motivo, 
                   p.observaciones, 
                   t_origen.nombres || ' ' || t_origen.apellido_paterno AS trabajador_origen,
                   t_destino.nombres || ' ' || t_destino.apellido_paterno AS trabajador_destino,
                   l_origen.nombre_ambiente AS lugar_origen,
                   l_destino.nombre_ambiente AS lugar_destino
            FROM papeletas p
            LEFT JOIN trabajadores t_origen ON p.id_trabajador_origen = t_origen.id_trabajador
            LEFT JOIN trabajadores t_destino ON p.id_trabajador_destino = t_destino.id_trabajador
            LEFT JOIN lugares l_origen ON p.id_lugar_origen = l_origen.id_lugar
            LEFT JOIN lugares l_destino ON p.id_lugar_destino = l_destino.id_lugar
            WHERE p.id_papeleta = $1
        `;
        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Movimiento no encontrado.' });
        }

        successResponse(res, result.rows[0], 'Movimiento obtenido exitosamente');
    } catch (error) {
        console.error('Error al obtener el movimiento:', error);
        errorResponse(res, error, 'Error al obtener el movimiento');
    }
};

module.exports = {
    getAllMovimientos,
    getFilteredMovimientos,
    getMovimientoById,
};
