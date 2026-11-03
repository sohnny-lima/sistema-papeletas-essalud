const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const { toPositiveInt, parseFecha } = require('../utils/papeletaValidation');

// Obtener todos los movimientos con datos relacionados
const getAllMovimientos = async (req, res) => {
    try {
        const query = `
            SELECT p.id_papeleta, 
                   TO_CHAR(p.fecha, 'YYYY-MM-DD') AS fecha,
                   p.numero_papeleta,
                   p.motivo, 
                   p.observaciones, 
                   CONCAT_WS(' ', t_origen.nombres, t_origen.apellido_paterno, t_origen.apellido_materno) AS trabajador_origen,
                   CONCAT_WS(' ', t_destino.nombres, t_destino.apellido_paterno, t_destino.apellido_materno) AS trabajador_destino,
                   l_origen.nombre_ambiente AS lugar_origen,
                   l_destino.nombre_ambiente AS lugar_destino
            FROM papeletas p
            LEFT JOIN trabajadores t_origen ON p.id_trabajador_origen = t_origen.id_trabajador
            LEFT JOIN trabajadores t_destino ON p.id_trabajador_destino = t_destino.id_trabajador
            LEFT JOIN lugares l_origen ON p.id_lugar_origen = l_origen.id_lugar
            LEFT JOIN lugares l_destino ON p.id_lugar_destino = l_destino.id_lugar
            ORDER BY p.fecha DESC, p.numero_papeleta DESC, p.id_papeleta DESC;
        `;
        const result = await pool.query(query);

        successResponse(res, result.rows, 'Movimientos obtenidos exitosamente');
    } catch (error) {
        errorResponse(res, error, 'Error al obtener los movimientos');
    }
};

// Obtener movimientos filtrados por fechas, trabajadores, o lugares
const getFilteredMovimientos = async (req, res) => {
    const { fechaInicio, fechaFin, trabajador, lugar } = req.query;
    for (const [campo, valor] of Object.entries({ fechaInicio, fechaFin })) {
        if (valor !== undefined && (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor) || !parseFecha(valor))) {
            return res.status(400).json({ success: false, message: campo + ' debe ser una fecha válida YYYY-MM-DD.' });
        }
    }
    if ([trabajador, lugar].some(valor => valor !== undefined && typeof valor !== 'string')) {
        return res.status(400).json({ success: false, message: 'Los filtros de trabajador y lugar deben ser texto.' });
    }

    try {
        let query = `
            SELECT p.id_papeleta, 
                   TO_CHAR(p.fecha, 'YYYY-MM-DD') AS fecha,
                   p.numero_papeleta,
                   p.motivo, 
                   p.observaciones, 
                   CONCAT_WS(' ', t_origen.nombres, t_origen.apellido_paterno, t_origen.apellido_materno) AS trabajador_origen,
                   CONCAT_WS(' ', t_destino.nombres, t_destino.apellido_paterno, t_destino.apellido_materno) AS trabajador_destino,
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
        // Cada filtro usa el siguiente marcador libre ($1, $2…), sea cual sea la combinación.
        const addParam = (value) => {
            params.push(value);
            return `$${params.length}`;
        };

        if (fechaInicio) {
            conditions.push(`p.fecha >= ${addParam(fechaInicio)}::date`);
        }

        if (fechaFin) {
            conditions.push(`p.fecha <= ${addParam(fechaFin)}::date`);
        }

        if (trabajador) {
            const ph = addParam(`%${trabajador}%`);
            conditions.push(`(CONCAT_WS(' ', t_origen.nombres, t_origen.apellido_paterno, t_origen.apellido_materno) ILIKE ${ph} OR CONCAT_WS(' ', t_destino.nombres, t_destino.apellido_paterno, t_destino.apellido_materno) ILIKE ${ph})`);
        }

        if (lugar) {
            const ph = addParam(`%${lugar}%`);
            conditions.push(`(l_origen.nombre_ambiente ILIKE ${ph} OR l_destino.nombre_ambiente ILIKE ${ph})`);
        }

        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }

        query += ' ORDER BY p.fecha DESC, p.numero_papeleta DESC, p.id_papeleta DESC';

        const result = await pool.query(query, params);

        successResponse(res, result.rows, 'Movimientos filtrados obtenidos exitosamente');
    } catch (error) {
        errorResponse(res, error, 'Error al filtrar los movimientos');
    }
};

// Obtener un movimiento específico por ID de papeleta
const getMovimientoById = async (req, res) => {
    const id = toPositiveInt(req.params.id);
    if (id === null || id > 2147483647) {
        return res.status(400).json({ success: false, message: 'El identificador del movimiento no es válido.' });
    }

    try {
        const query = `
            SELECT p.id_papeleta, 
                   TO_CHAR(p.fecha, 'YYYY-MM-DD') AS fecha,
                   p.numero_papeleta,
                   p.motivo, 
                   p.observaciones, 
                   CONCAT_WS(' ', t_origen.nombres, t_origen.apellido_paterno, t_origen.apellido_materno) AS trabajador_origen,
                   CONCAT_WS(' ', t_destino.nombres, t_destino.apellido_paterno, t_destino.apellido_materno) AS trabajador_destino,
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
        errorResponse(res, error, 'Error al obtener el movimiento');
    }
};

module.exports = {
    getAllMovimientos,
    getFilteredMovimientos,
    getMovimientoById,
};
