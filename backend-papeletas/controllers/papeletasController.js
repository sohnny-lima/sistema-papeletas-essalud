const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const generatePapeletaNumber = require('../utils/generatePapeletaNumber');

const getAllPapeletas = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 10;
    const offset = (page - 1) * pageSize;
    const category = req.query.category || '';
    const filterText = (req.query.filterText || '').trim();

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
      if (searchableColumns[category]) {
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
      SELECT 
        p.id_papeleta, 
        p.numero_papeleta, 
        p.fecha, 
        tf.nombre AS tipo_formulario_nombre,

        -- ORIGEN
        CONCAT(t.nombres, ' ', t.apellido_paterno, ' ', t.apellido_materno) AS trabajador_origen_nombre,
        t.numero_identificacion AS trabajador_origen_codigo,

        -- DESTINO
        CONCAT(t2.nombres, ' ', t2.apellido_paterno, ' ', t2.apellido_materno) AS trabajador_destino_nombre,
        t2.numero_identificacion AS trabajador_destino_codigo,

        -- LUGARES
        CONCAT(lo.nombre_ambiente, ' (', lo.dependencia, ')') AS lugar_origen_nombre, 
        CONCAT(ld.nombre_ambiente, ' (', ld.dependencia, ')') AS lugar_destino_nombre,

        -- EQUIPOS
        JSON_AGG(
  JSON_BUILD_OBJECT(
    'id_equipo', e.id_equipo,
    'cod_patrimonial', e.cod_patrimonial,
    'descripcion', e.descripcion,
    'marca', e.marca,
    'serie', e.serie,
    'modelo', e.modelo
  )
) FILTER (WHERE e.id_equipo IS NOT NULL) AS equipos_patrimoniales

      ${fromClause}
      ${whereClause}

      GROUP BY 
        p.id_papeleta,
        tf.nombre,
        t.nombres, t.apellido_paterno, t.apellido_materno, t.numero_identificacion,
        t2.nombres, t2.apellido_paterno, t2.apellido_materno, t2.numero_identificacion,
        lo.nombre_ambiente, lo.dependencia,
        ld.nombre_ambiente, ld.dependencia

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
  const id = req.params.id;
  try {
    const query = `
      SELECT 
        p.id_papeleta, 
        p.numero_papeleta,
        p.fecha, 
        tf.nombre AS tipo_formulario_nombre,

        -- ORIGEN
        CONCAT(t.nombres, ' ', t.apellido_paterno, ' ', t.apellido_materno) AS trabajador_origen_nombre,
        t.numero_identificacion AS trabajador_origen_codigo,

        -- DESTINO
        CONCAT(t2.nombres, ' ', t2.apellido_paterno, ' ', t2.apellido_materno) AS trabajador_destino_nombre,
        t2.numero_identificacion AS trabajador_destino_codigo,

        -- LUGARES
        CONCAT(lo.nombre_ambiente, ' (', lo.dependencia, ')') AS lugar_origen_nombre,
        CONCAT(ld.nombre_ambiente, ' (', ld.dependencia, ')') AS lugar_destino_nombre,

        -- CENTROS
        co.nombre_centro AS origen_centro,
        cd.nombre_centro AS destino_centro,

        -- EQUIPOS
        JSON_AGG(
          CASE WHEN e.id_equipo IS NOT NULL THEN
            JSON_BUILD_OBJECT(
              'id_equipo', e.id_equipo,
              'cod_patrimonial', e.cod_patrimonial,
              'descripcion', e.descripcion,
              'marca', e.marca,
              'modelo', e.modelo,
              'serie', e.serie
            )
          ELSE NULL END
        ) FILTER (WHERE e.id_equipo IS NOT NULL) AS equipos_patrimoniales

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

      GROUP BY 
        p.id_papeleta, tf.nombre,
        t.nombres, t.apellido_paterno, t.apellido_materno, t.numero_identificacion,
        t2.nombres, t2.apellido_paterno, t2.apellido_materno, t2.numero_identificacion,
        lo.nombre_ambiente, lo.dependencia,
        ld.nombre_ambiente, ld.dependencia,
        co.nombre_centro, cd.nombre_centro;
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Papeleta no encontrada.' });
    }

    return successResponse(res, result.rows[0], 'Papeleta obtenida exitosamente');
  } catch (error) {
    return errorResponse(res, error, 'Error al obtener la papeleta');
  }
};



// Crear una nueva papeleta (con IDs)
const createPapeleta = async (req, res) => {
  const {
    id_trabajador_origen,
    id_trabajador_destino,
    id_tipo_formulario,
    id_lugar_origen,
    id_lugar_destino,
    fecha,
    equipmentIds = []
  } = req.body;

  if (
    !id_trabajador_origen ||
    !id_trabajador_destino ||
    !id_tipo_formulario ||
    !id_lugar_origen ||
    !id_lugar_destino ||
    !fecha ||
    !Array.isArray(equipmentIds) ||
    equipmentIds.length === 0
  ) {
    return res.status(400).json({
      success: false,
      message: 'Complete todos los campos obligatorios de la papeleta.'
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Generamos número de papeleta
    const numeroPapeleta = generatePapeletaNumber();
    // O, si ya obtienes un "último número" de otro lado, úsalo.

    const insertQuery = `
      INSERT INTO papeletas (
        numero_papeleta, fecha, id_tipo_formulario,
        id_trabajador_origen, id_trabajador_destino,
        id_lugar_origen, id_lugar_destino
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id_papeleta;
    `;
    const insertValues = [
      numeroPapeleta,
      fecha,
      id_tipo_formulario,
      id_trabajador_origen,
      id_trabajador_destino,
      id_lugar_origen,
      id_lugar_destino
    ];
    const result = await client.query(insertQuery, insertValues);
    const id_papeleta = result.rows[0].id_papeleta;

    // Insertar equipos relacionados
    if (Array.isArray(equipmentIds) && equipmentIds.length > 0) {
      const insertEquipoQuery = `
        INSERT INTO papeleta_equipos (id_papeleta, id_equipo)
        VALUES ($1, $2);
      `;
      for (const eqId of equipmentIds) {
        await client.query(insertEquipoQuery, [id_papeleta, eqId]);
      }
    }

    await client.query('COMMIT');
    return successResponse(
      res,
      { id_papeleta },
      'Papeleta creada exitosamente'
    );
  } catch (error) {
    await client.query('ROLLBACK');
    return errorResponse(res, error, 'Error al guardar la papeleta');
  } finally {
    client.release();
  }
};

// Actualizar una papeleta
const updatePapeleta = async (req, res) => {
  const id = req.params.id;
  const {
    id_tipo_formulario,
    id_trabajador_origen,
    id_trabajador_destino,
    id_lugar_origen,
    id_lugar_destino,
    equipmentIds
  } = req.body;

  // Verificación básica de campos
  if (
    !id_tipo_formulario ||
    !id_trabajador_origen ||
    !id_trabajador_destino ||
    !id_lugar_origen ||
    !id_lugar_destino ||
    !equipmentIds ||
    !Array.isArray(equipmentIds)
  ) {
    return res.status(400).json({
      success: false,
      message: 'Datos incompletos para actualizar.'
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updatePapeletaQuery = `
      UPDATE papeletas
      SET 
        id_tipo_formulario = $1,
        id_trabajador_origen = $2,
        id_trabajador_destino = $3,
        id_lugar_origen = $4,
        id_lugar_destino = $5
      WHERE id_papeleta = $6
      RETURNING *;
    `;
    const papeletaParams = [
      id_tipo_formulario,
      id_trabajador_origen,
      id_trabajador_destino,
      id_lugar_origen,
      id_lugar_destino,
      id
    ];
    const result = await client.query(updatePapeletaQuery, papeletaParams);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Papeleta no encontrada.'
      });
    }

    // Eliminar equipos anteriores
    const deleteEquiposQuery = `
      DELETE FROM papeleta_equipos
      WHERE id_papeleta = $1;
    `;
    await client.query(deleteEquiposQuery, [id]);

    // Insertar nuevamente los equipos
    const insertEquipoQuery = `
      INSERT INTO papeleta_equipos (id_papeleta, id_equipo)
      VALUES ($1, $2);
    `;
    for (const eqId of equipmentIds) {
      await client.query(insertEquipoQuery, [id, eqId]);
    }

    await client.query('COMMIT');
    return successResponse(
      res,
      result.rows[0],
      'Papeleta actualizada exitosamente'
    );
  } catch (error) {
    await client.query('ROLLBACK');
    return errorResponse(res, error, 'Error al actualizar la papeleta');
  } finally {
    client.release();
  }
};

// Eliminar una papeleta
const deletePapeleta = async (req, res) => {
  const id = req.params.id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Eliminar primero las referencias en papeleta_equipos
    const deleteEquiposQuery = `
      DELETE FROM papeleta_equipos
      WHERE id_papeleta = $1;
    `;
    await client.query(deleteEquiposQuery, [id]);

    const deletePapeletaQuery = `
      DELETE FROM papeletas
      WHERE id_papeleta = $1
      RETURNING *;
    `;
    const result = await client.query(deletePapeletaQuery, [id]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res
        .status(404)
        .json({ success: false, message: 'Papeleta no encontrada.' });
    }
    await client.query('COMMIT');

    return successResponse(
      res,
      result.rows[0],
      'Papeleta eliminada exitosamente'
    );
  } catch (error) {
    await client.query('ROLLBACK');
    return errorResponse(res, error, 'Error al eliminar la papeleta');
  } finally {
    client.release();
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
      WHERE numero_papeleta ~ '^PA-\\d+$';
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
