const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/responseHandler');

// Obtener todos los registros de papeleta_equipos
const getAllPapeletaEquipos = async (req, res) => {
    try {
        const query = `
            SELECT pe.id, pe.id_papeleta, pe.id_equipo, e.descripcion AS equipo_descripcion, 
                   e.marca, e.modelo, p.numero_papeleta 
            FROM papeleta_equipos pe
            JOIN equipos e ON pe.id_equipo = e.id_equipo
            JOIN papeletas p ON pe.id_papeleta = p.id_papeleta
            ORDER BY pe.id ASC;
        `;
        const result = await pool.query(query);
        successResponse(res, result.rows, 'Registros de papeletas y equipos obtenidos exitosamente');
    } catch (error) {
        console.error('Error al obtener los registros de papeleta_equipos:', error);
        errorResponse(res, error, 'Error al obtener los registros de papeleta_equipos');
    }
};

// Obtener un registro de papeleta_equipos por ID
const getPapeletaEquipoById = async (req, res) => {
    const id = req.params.id;

    try {
        const query = `
            SELECT pe.id, pe.id_papeleta, pe.id_equipo, e.descripcion AS equipo_descripcion, 
                   e.marca, e.modelo, p.numero_papeleta 
            FROM papeleta_equipos pe
            JOIN equipos e ON pe.id_equipo = e.id_equipo
            JOIN papeletas p ON pe.id_papeleta = p.id_papeleta
            WHERE pe.id = $1;
        `;
        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Registro de papeleta y equipo no encontrado.' });
        }

        successResponse(res, result.rows[0], 'Registro obtenido exitosamente');
    } catch (error) {
        console.error('Error al obtener el registro de papeleta_equipos:', error);
        errorResponse(res, error, 'Error al obtener el registro de papeleta_equipos');
    }
};

// Crear un nuevo registro en papeleta_equipos
const createPapeletaEquipo = async (req, res) => {
    const { id_papeleta, id_equipo } = req.body;

    if (!id_papeleta || !id_equipo) {
        return res.status(400).json({ success: false, message: 'Los campos id_papeleta e id_equipo son obligatorios.' });
    }

    try {
        const query = `
            INSERT INTO papeleta_equipos (id_papeleta, id_equipo) 
            VALUES ($1, $2) RETURNING *;
        `;
        const result = await pool.query(query, [id_papeleta, id_equipo]);
        successResponse(res, result.rows[0], 'Registro creado exitosamente');
    } catch (error) {
        console.error('Error al crear el registro de papeleta_equipos:', error);
        errorResponse(res, error, 'Error al crear el registro de papeleta_equipos');
    }
};

// Actualizar un registro existente en papeleta_equipos
const updatePapeletaEquipo = async (req, res) => {
    const id = req.params.id;
    const { id_papeleta, id_equipo } = req.body;

    if (!id_papeleta || !id_equipo) {
        return res.status(400).json({ success: false, message: 'Los campos id_papeleta e id_equipo son obligatorios.' });
    }

    try {
        const query = `
            UPDATE papeleta_equipos 
            SET id_papeleta = $1, id_equipo = $2 
            WHERE id = $3 RETURNING *;
        `;
        const result = await pool.query(query, [id_papeleta, id_equipo, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Registro no encontrado.' });
        }

        successResponse(res, result.rows[0], 'Registro actualizado exitosamente');
    } catch (error) {
        console.error('Error al actualizar el registro de papeleta_equipos:', error);
        errorResponse(res, error, 'Error al actualizar el registro de papeleta_equipos');
    }
};

// Eliminar un registro de papeleta_equipos
const deletePapeletaEquipo = async (req, res) => {
    const id = req.params.id;

    try {
        const query = 'DELETE FROM papeleta_equipos WHERE id = $1 RETURNING *;';
        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Registro no encontrado.' });
        }

        successResponse(res, result.rows[0], 'Registro eliminado exitosamente');
    } catch (error) {
        console.error('Error al eliminar el registro de papeleta_equipos:', error);
        errorResponse(res, error, 'Error al eliminar el registro de papeleta_equipos');
    }
};

module.exports = {
    getAllPapeletaEquipos,
    getPapeletaEquipoById,
    createPapeletaEquipo,
    updatePapeletaEquipo,
    deletePapeletaEquipo,
};
