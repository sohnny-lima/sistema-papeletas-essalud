const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { generateNextPapeletaNumber } = require('../utils/papeletaNumber');
const {
  toPositiveInt,
  validatePapeletaBody,
  checkPapeletaReferences
} = require('../utils/papeletaValidation');
const { safeRollback, releaseClient } = require('../utils/transaccion');

// Columnas comunes del listado y del detalle.
// La fecha se devuelve como texto 'YYYY-MM-DD' para que no cambie con la zona horaria.
const PAPELETA_COLUMNS = `
        p.id_papeleta,
        p.numero_papeleta,
        TO_CHAR(p.fecha, 'YYYY-MM-DD') AS fecha,
        p.id_tipo_formulario,
        p.id_trabajador_origen,
        p.id_trabajador_destino,
        p.id_lugar_origen,
        p.id_lugar_destino,
        tf.nombre AS tipo_formulario_nombre,

        -- ORIGEN
        CONCAT(t.nombres, ' ', t.apellido_paterno, ' ', t.apellido_materno) AS trabajador_origen_nombre,
        t.numero_identificacion AS trabajador_origen_codigo,

        -- DESTINO
        CONCAT(t2.nombres, ' ', t2.apellido_paterno, ' ', t2.apellido_materno) AS trabajador_destino_nombre,
        t2.numero_identificacion AS trabajador_destino_codigo,

        -- LUGARES: campos separados para el PDF; se conservan los nombres compuestos.
        lo.nombre_ambiente AS lugar_origen_ambiente,
        lo.dependencia AS lugar_origen_dependencia,
        ld.nombre_ambiente AS lugar_destino_ambiente,
        ld.dependencia AS lugar_destino_dependencia,
        CONCAT(lo.nombre_ambiente, ' (', lo.dependencia, ')') AS lugar_origen_nombre,
        CONCAT(ld.nombre_ambiente, ' (', ld.dependencia, ')') AS lugar_destino_nombre,

        -- EQUIPOS
        COALESCE(JSON_AGG(
          JSON_BUILD_OBJECT(
            'id_equipo', e.id_equipo,
            'cod_patrimonial', e.cod_patrimonial,
            'descripcion', e.descripcion,
            'marca', e.marca,
            'serie', e.serie,
            'modelo', e.modelo
          )
        ) FILTER (WHERE e.id_equipo IS NOT NULL), '[]'::json) AS equipos_patrimoniales
`;

const PAPELETA_GROUP_BY = `
      GROUP BY
        p.id_papeleta,
        tf.nombre,
        t.nombres, t.apellido_paterno, t.apellido_materno, t.numero_identificacion,
        t2.nombres, t2.apellido_paterno, t2.apellido_materno, t2.numero_identificacion,
        lo.nombre_ambiente, lo.dependencia,
        ld.nombre_ambiente, ld.dependencia
`;

const badRequest = (res, message) => res.status(400).json({ success: false, message });
const notFound = (res) => res.status(404).json({ success: false, message: 'Papeleta no encontrada.' });

/** Lee y valida el :id de la ruta; responde 400 y devuelve null si no es válido. */
function parseIdParam(req, res) {
  const id = toPositiveInt(req.params.id);
  if (id === null) {
    badRequest(res, 'El identificador de la papeleta no es válido.');
    return null;
  }
  return id;
}

const getAllPapeletas = async (req, res) => {
  try {
    const { page, pageSize, offset } = getPagination(req.query);
    const category = req.query.category || '';
    const filterText = String(req.query.filterText || '').trim();

    const fromClause = `
      FROM papeletas p
        LEFT JOIN trabajadores t ON p.id_trabajador_origen = t.id_trabajador
        LEFT JOIN trabajadores t2 ON p.id_trabajador_destino = t2.id_trabajador
        LEFT JOIN tipo_formulario tf ON p.id_tipo_formulario = tf.id_tipo_formulario
        LEFT JOIN lugares lo ON p.id_lugar_origen = lo.id_lugar
        LEFT JOIN lugares ld ON p.id_lugar_destino = ld.id_lugar
        LEFT JOIN papeleta_equipos pe ON p.id_papeleta = pe.id_papeleta
        LEFT JOIN equipos e ON pe.id_equipo = e.id_equipo
    `;

    const searchableColumns = {
      numero_papeleta: 'p.numero_papeleta',
      tipo_formulario: 'tf.nombre',
      trabajador_origen: "CONCAT(t.nombres, ' ', t.apellido_paterno, ' ', t.apellido_materno, ' ', t.numero_identificacion)",
      trabajador_destino: "CONCAT(t2.nombres, ' ', t2.apellido_paterno, ' ', t2.apellido_materno, ' ', t2.numero_identificacion)",
      lugar_origen: "CONCAT(lo.nombre_ambiente, ' ', lo.dependencia)",
      lugar_destino: "CONCAT(ld.nombre_ambiente, ' ', ld.dependencia)",
      equipo: `EXISTS (
        SELECT 1
        FROM papeleta_equipos pe_search
        JOIN equipos e_search ON pe_search.id_equipo = e_search.id_equipo
        WHERE pe_search.id_papeleta = p.id_papeleta
          AND CONCAT(e_search.cod_patrimonial, ' ', e_search.descripcion, ' ', e_search.marca, ' ', e_search.serie, ' ', e_search.modelo) ILIKE $1
      )`
    };

    const params = [];
    let whereClause = '';

    if (filterText) {
      params.push(`%${filterText}%`);
      if (Object.hasOwn(searchableColumns, category)) {
        whereClause = category === 'equipo'
          ? `WHERE ${searchableColumns[category]}`
          : `WHERE ${searchableColumns[category]} ILIKE $1`;
      } else {
        whereClause = `
          WHERE p.numero_papeleta ILIKE $1
             OR tf.nombre ILIKE $1
             OR CONCAT(t.nombres, ' ', t.apellido_paterno, ' ', t.apellido_materno, ' ', t.numero_identificacion) ILIKE $1
             OR CONCAT(t2.nombres, ' ', t2.apellido_paterno, ' ', t2.apellido_materno, ' ', t2.numero_identificacion) ILIKE $1
             OR CONCAT(lo.nombre_ambiente, ' ', lo.dependencia) ILIKE $1
             OR CONCAT(ld.nombre_ambiente, ' ', ld.dependencia) ILIKE $1
             OR EXISTS (
                  SELECT 1
                  FROM papeleta_equipos pe_search
                  JOIN equipos e_search ON pe_search.id_equipo = e_search.id_equipo
                  WHERE pe_search.id_papeleta = p.id_papeleta
                    AND CONCAT(e_search.cod_patrimonial, ' ', e_search.descripcion, ' ', e_search.marca, ' ', e_search.serie, ' ', e_search.modelo) ILIKE $1
                )
        `;
      }
    }

    const query = `
      SELECT ${PAPELETA_COLUMNS}
      ${fromClause}
      ${whereClause}
      ${PAPELETA_GROUP_BY}
      ORDER BY p.id_papeleta ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2};
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT p.id_papeleta) AS total
      ${fromClause}
      ${whereClause};
    `;

    const countResult = await pool.query(countQuery, params);
    const totalItems = parseInt(countResult.rows[0].total, 10) || 0;
    const result = await pool.query(query, [...params, pageSize, offset]);

    return successResponse(res, {
      data: result.rows,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
      currentPage: page
    }, 'Papeletas obtenidas exitosamente');
  } catch (error) {
    return errorResponse(res, error, 'Error al obtener las papeletas');
  }
};


// Obtener una papeleta por ID
const getPapeletaById = async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === null) return;
  try {
    const query = `
      SELECT ${PAPELETA_COLUMNS},
        -- CENTROS
        co.nombre_centro AS origen_centro,
        cd.nombre_centro AS destino_centro

      FROM papeletas p
        LEFT JOIN trabajadores t ON p.id_trabajador_origen = t.id_trabajador
        LEFT JOIN trabajadores t2 ON p.id_trabajador_destino = t2.id_trabajador
        LEFT JOIN tipo_formulario tf ON p.id_tipo_formulario = tf.id_tipo_formulario
        LEFT JOIN lugares lo ON p.id_lugar_origen = lo.id_lugar
        LEFT JOIN lugares ld ON p.id_lugar_destino = ld.id_lugar
        LEFT JOIN centros_asistenciales co ON lo.id_centro = co.id_centro
        LEFT JOIN centros_asistenciales cd ON ld.id_centro = cd.id_centro
        LEFT JOIN papeleta_equipos pe ON p.id_papeleta = pe.id_papeleta
        LEFT JOIN equipos e ON pe.id_equipo = e.id_equipo

      WHERE p.id_papeleta = $1

      ${PAPELETA_GROUP_BY},
        co.nombre_centro, cd.nombre_centro;
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return notFound(res);
    }

    return successResponse(res, result.rows[0], 'Papeleta obtenida exitosamente');
  } catch (error) {
    return errorResponse(res, error, 'Error al obtener la papeleta');
  }
};

async function insertEquipos(client, idPapeleta, equipmentIds) {
  await client.query(
    `INSERT INTO papeleta_equipos (id_papeleta, id_equipo)
     SELECT $1, UNNEST($2::int[])`,
    [idPapeleta, equipmentIds]
  );
}

// Crear una nueva papeleta.
// El número se asigna aquí (PA-NNNN correlativo) bajo un bloqueo de transacción, así que
// dos solicitudes simultáneas nunca reciben el mismo número. El que envíe el cliente se ignora.
const createPapeleta = async (req, res) => {
  const { errors, value } = validatePapeletaBody(req.body, { requireFecha: true });
  if (errors.length > 0) {
    return badRequest(res, errors.join(' '));
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const referenceError = await checkPapeletaReferences(client, value);
    if (referenceError) {
      await safeRollback(client);
      return badRequest(res, referenceError);
    }

    const numeroPapeleta = await generateNextPapeletaNumber(client);

    const result = await client.query(
      `INSERT INTO papeletas (
        numero_papeleta, fecha, id_tipo_formulario,
        id_trabajador_origen, id_trabajador_destino,
        id_lugar_origen, id_lugar_destino
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id_papeleta, numero_papeleta;`,
      [
        numeroPapeleta,
        value.fecha,
        value.id_tipo_formulario,
        value.id_trabajador_origen,
        value.id_trabajador_destino,
        value.id_lugar_origen,
        value.id_lugar_destino
      ]
    );
    const { id_papeleta, numero_papeleta } = result.rows[0];

    await insertEquipos(client, id_papeleta, value.equipmentIds);

    await client.query('COMMIT');
    return successResponse(
      res,
      { id_papeleta, numero_papeleta },
      `Papeleta ${numero_papeleta} creada exitosamente`
    );
  } catch (error) {
    if (client) await safeRollback(client, error);
    return errorResponse(res, error, 'Error al guardar la papeleta');
  } finally {
    releaseClient(client);
  }
};

// Actualizar una papeleta. El número no cambia. Si no llega la fecha, se conserva la actual.
const updatePapeleta = async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === null) return;

  const { errors, value } = validatePapeletaBody(req.body, { requireFecha: false });
  if (errors.length > 0) {
    return badRequest(res, errors.join(' '));
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT 1 FROM papeletas WHERE id_papeleta = $1 FOR UPDATE',
      [id]
    );
    if (existing.rows.length === 0) {
      await safeRollback(client);
      return notFound(res);
    }

    const referenceError = await checkPapeletaReferences(client, value);
    if (referenceError) {
      await safeRollback(client);
      return badRequest(res, referenceError);
    }

    const result = await client.query(
      `UPDATE papeletas
      SET
        id_tipo_formulario = $1,
        id_trabajador_origen = $2,
        id_trabajador_destino = $3,
        id_lugar_origen = $4,
        id_lugar_destino = $5,
        fecha = COALESCE($6::date, fecha)
      WHERE id_papeleta = $7
      RETURNING id_papeleta, numero_papeleta, TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha,
        id_tipo_formulario, id_trabajador_origen, id_trabajador_destino,
        id_lugar_origen, id_lugar_destino;`,
      [
        value.id_tipo_formulario,
        value.id_trabajador_origen,
        value.id_trabajador_destino,
        value.id_lugar_origen,
        value.id_lugar_destino,
        value.fecha ?? null,
        id
      ]
    );

    // Reemplazar los equipos asociados
    await client.query('DELETE FROM papeleta_equipos WHERE id_papeleta = $1;', [id]);
    await insertEquipos(client, id, value.equipmentIds);

    await client.query('COMMIT');
    return successResponse(res, result.rows[0], 'Papeleta actualizada exitosamente');
  } catch (error) {
    if (client) await safeRollback(client, error);
    return errorResponse(res, error, 'Error al actualizar la papeleta');
  } finally {
    releaseClient(client);
  }
};

// Eliminar una papeleta
const deletePapeleta = async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === null) return;

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Bloquear primero la papeleta (mismo orden que updatePapeleta, evita interbloqueos)
    const existing = await client.query(
      'SELECT 1 FROM papeletas WHERE id_papeleta = $1 FOR UPDATE',
      [id]
    );
    if (existing.rows.length === 0) {
      await safeRollback(client);
      return notFound(res);
    }

    // Eliminar primero las referencias en papeleta_equipos
    await client.query('DELETE FROM papeleta_equipos WHERE id_papeleta = $1;', [id]);

    const result = await client.query(
      `DELETE FROM papeletas WHERE id_papeleta = $1
       RETURNING *, TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha;`,
      [id]
    );
    await client.query('COMMIT');

    return successResponse(res, result.rows[0], 'Papeleta eliminada exitosamente');
  } catch (error) {
    if (client) await safeRollback(client, error);
    return errorResponse(res, error, 'Error al eliminar la papeleta');
  } finally {
    releaseClient(client);
  }
};

// Buscar trabajadores
const searchTrabajadores = async (req, res) => {
  const search = String(req.query.search || '').trim();
  if (search.length < 3) {
    return successResponse(res, [], 'Texto de búsqueda muy corto.');
  }

  const isNumericSearch = /^\d+$/.test(search);
  const pattern = isNumericSearch ? `${search}%` : `%${search}%`;

  try {
    const query = isNumericSearch ? `
      SELECT 
        id_trabajador, nombres, 
        apellido_paterno, apellido_materno, 
        numero_identificacion
      FROM trabajadores
      WHERE numero_identificacion ILIKE $1
      ORDER BY numero_identificacion ASC
      LIMIT 10;
    ` : `
      SELECT 
        id_trabajador, nombres, 
        apellido_paterno, apellido_materno, 
        numero_identificacion
      FROM trabajadores
      WHERE 
        numero_identificacion ILIKE $1
        OR nombres ILIKE $1
        OR apellido_paterno ILIKE $1
        OR apellido_materno ILIKE $1
      ORDER BY id_trabajador
      LIMIT 10;
    `;
    const result = await pool.query(query, [pattern]);
    return successResponse(res, result.rows, 'Trabajadores encontrados exitosamente');
  } catch (error) {
    return errorResponse(res, error, 'Error al buscar trabajadores');
  }
};

// Buscar lugares

// Buscar equipos
const searchEquipos = async (req, res) => {
  const search = String(req.query.search || req.query.query || '').trim();
  if (search.length < 3) {
    return successResponse(res, [], 'Texto de búsqueda muy corto.');
  }

  const isNumericSearch = /^\d+$/.test(search);
  const pattern = isNumericSearch ? `${search}%` : `%${search}%`;

  try {
    const query = isNumericSearch ? `
      SELECT id_equipo, cod_patrimonial, descripcion, marca, serie, modelo
      FROM equipos
      WHERE cod_patrimonial ILIKE $1
         OR serie ILIKE $1
      ORDER BY cod_patrimonial
      LIMIT 10;
    ` : `
      SELECT id_equipo, cod_patrimonial, descripcion, marca, serie, modelo
      FROM equipos
      WHERE cod_patrimonial ILIKE $1
         OR descripcion ILIKE $1
         OR marca ILIKE $1
         OR serie ILIKE $1
         OR modelo ILIKE $1
      ORDER BY id_equipo
      LIMIT 10;
    `;
    const result = await pool.query(query, [pattern]);
    return successResponse(res, result.rows, 'Equipos encontrados exitosamente');
  } catch (error) {
    return errorResponse(res, error, 'Error al buscar equipos');
  }
};

// Obtener último número de papeleta
const getLastPapeletaNumber = async (req, res) => {
  try {
    const query = `
      SELECT COALESCE(
        MAX(CAST(SUBSTRING(numero_papeleta, 4) AS INTEGER)), 
        0
      ) AS last_number
      FROM papeletas
      WHERE numero_papeleta ~ '^PA-\\d{1,9}$';
    `;
    const result = await pool.query(query);
    return successResponse(
      res,
      { last_number: result.rows[0].last_number },
      'Último número de papeleta obtenido exitosamente'
    );
  } catch (error) {
    return errorResponse(res, error, 'Error al obtener el último número de papeleta');
  }
};

// Tipos de formulario
const getTiposFormulario = async (req, res) => {
  try {
    const query = 'SELECT id_tipo_formulario, nombre FROM tipo_formulario;';
    const result = await pool.query(query);
    return successResponse(res, result.rows, 'Tipos de formulario obtenidos exitosamente');
  } catch (error) {
    return errorResponse(res, error, 'Error al obtener tipos de formulario');
  }
};

module.exports = {
  getAllPapeletas,
  getPapeletaById,
  createPapeleta,
  updatePapeleta,
  deletePapeleta,
  searchTrabajadores,
  searchEquipos,
  getTiposFormulario,
  getLastPapeletaNumber
};
