const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const { toPositiveInt } = require('../utils/papeletaValidation');
const { normalizarNombreCentro, validarNombreCentro } = require('../utils/centroValidation');
const { safeRollback, releaseClient } = require('../utils/transaccion');

// Bloqueo consultivo de las altas y cambios de nombre de centros: serializa la comprobación
// de duplicados y la escritura (dos peticiones simultáneas con el mismo nombre no pasan ambas).
const CENTROS_LOCK = 2026102702;

const COLUMNAS = 'id_centro, nombre_centro';

const badRequest = (res, message) => res.status(400).json({ success: false, message });
const notFound = (res) => res.status(404).json({ success: false, message: 'Centro asistencial no encontrado.' });

/** Lee y valida el :id de la ruta; responde 400 y devuelve null si no es válido. */
function parseIdParam(req, res) {
    const id = toPositiveInt(req.params.id);
    if (id === null) {
        badRequest(res, 'El identificador del centro asistencial no es válido.');
        return null;
    }
    return id;
}

/** Centro con el mismo nombre normalizado (salvo excluirId), o null. Se compara en JS para no depender de la configuración regional de la base. */
async function buscarDuplicado(client, nombre, excluirId = null) {
    const { rows } = await client.query(`SELECT ${COLUMNAS} FROM centros_asistenciales`);
    // Number(): si en la base real id_centro fuera BIGINT, pg lo devolvería como texto.
    return rows.find((r) => Number(r.id_centro) !== excluirId && normalizarNombreCentro(r.nombre_centro) === nombre) || null;
}

function responderDuplicado(res, existente) {
    return res.status(409).json({
        success: false,
        message: `Ya existe un centro asistencial llamado «${normalizarNombreCentro(existente.nombre_centro)}».`,
        data: { id_centro: Number(existente.id_centro) },
    });
}

// El índice único de la migración 002 es la segunda barrera (escrituras ajenas a la API).
// Solo esa restricción significa «nombre repetido»; cualquier otro error (también otros 23505,
// p. ej. una secuencia de id desfasada) sigue el mapeo general de errorResponse.
const INDICE_NOMBRE = 'ux_centros_asistenciales_nombre';

function responderErrorEscritura(res, error, mensaje) {
    if (error && error.code === '23505' && error.constraint === INDICE_NOMBRE) {
        return res.status(409).json({ success: false, message: 'Ya existe un centro asistencial con ese nombre.' });
    }
    return errorResponse(res, error, mensaje);
}

// Obtener todos los centros asistenciales, con el número de lugares de cada uno
const getAllCentros = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.id_centro, c.nombre_centro, COUNT(l.id_lugar)::int AS total_lugares
            FROM centros_asistenciales c
            LEFT JOIN lugares l ON l.id_centro = c.id_centro
            GROUP BY c.id_centro, c.nombre_centro
            ORDER BY c.nombre_centro ASC, c.id_centro ASC
        `);
        successResponse(res, result.rows, 'Centros asistenciales obtenidos exitosamente');
    } catch (error) {
        errorResponse(res, error, 'Error al obtener los centros asistenciales');
    }
};

// Obtener un centro asistencial por ID
const getCentroById = async (req, res) => {
    const id = parseIdParam(req, res);
    if (id === null) return;

    try {
        const result = await pool.query(`SELECT ${COLUMNAS} FROM centros_asistenciales WHERE id_centro = $1`, [id]);
        if (result.rows.length === 0) return notFound(res);
        successResponse(res, result.rows[0], 'Centro asistencial obtenido exitosamente');
    } catch (error) {
        errorResponse(res, error, 'Error al obtener el centro asistencial');
    }
};

// Crear un nuevo centro asistencial (solo administradores; ver la ruta)
const createCentro = async (req, res) => {
    const { nombre, error: errorNombre } = validarNombreCentro((req.body || {}).nombre_centro);
    if (errorNombre) return badRequest(res, errorNombre);

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [CENTROS_LOCK]);

        const existente = await buscarDuplicado(client, nombre);
        if (existente) {
            await safeRollback(client);
            return responderDuplicado(res, existente);
        }

        const result = await client.query(
            `INSERT INTO centros_asistenciales (nombre_centro) VALUES ($1) RETURNING ${COLUMNAS}`,
            [nombre]
        );
        await client.query('COMMIT');
        successResponse(res, result.rows[0], 'Centro asistencial creado exitosamente');
    } catch (error) {
        if (client) await safeRollback(client, error);
        responderErrorEscritura(res, error, 'Error al crear el centro asistencial');
    } finally {
        releaseClient(client);
    }
};

// Actualizar el nombre de un centro asistencial (solo administradores)
const updateCentro = async (req, res) => {
    const id = parseIdParam(req, res);
    if (id === null) return;
    const { nombre, error: errorNombre } = validarNombreCentro((req.body || {}).nombre_centro);
    if (errorNombre) return badRequest(res, errorNombre);

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [CENTROS_LOCK]);

        const actual = await client.query(
            'SELECT id_centro FROM centros_asistenciales WHERE id_centro = $1 FOR UPDATE',
            [id]
        );
        if (actual.rows.length === 0) {
            await safeRollback(client);
            return notFound(res);
        }

        const existente = await buscarDuplicado(client, nombre, id);
        if (existente) {
            await safeRollback(client);
            return responderDuplicado(res, existente);
        }

        const result = await client.query(
            `UPDATE centros_asistenciales SET nombre_centro = $1 WHERE id_centro = $2 RETURNING ${COLUMNAS}`,
            [nombre, id]
        );
        await client.query('COMMIT');
        successResponse(res, result.rows[0], 'Centro asistencial actualizado exitosamente');
    } catch (error) {
        if (client) await safeRollback(client, error);
        responderErrorEscritura(res, error, 'Error al actualizar el centro asistencial');
    } finally {
        releaseClient(client);
    }
};

// Eliminar un centro asistencial (solo administradores; sin opción en la interfaz).
// Si tiene lugares asociados, la clave foránea lo impide y la API responde 409.
const deleteCentro = async (req, res) => {
    const id = parseIdParam(req, res);
    if (id === null) return;

    try {
        const result = await pool.query(
            `DELETE FROM centros_asistenciales WHERE id_centro = $1 RETURNING ${COLUMNAS}`,
            [id]
        );
        if (result.rows.length === 0) return notFound(res);
        successResponse(res, result.rows[0], 'Centro asistencial eliminado exitosamente');
    } catch (error) {
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
