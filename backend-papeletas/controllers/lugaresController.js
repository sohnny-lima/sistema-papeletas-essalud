const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/responseHandler');

// -------------------------------------------------------
// Obtener todos los lugares con nombre del centro asistencial
// -------------------------------------------------------
// Ejemplo de ruta GET /api/lugares con paginación y filtros
const getAllLugares = async (req, res) => {
  try {
    // 1. Leer query params
    let { page, pageSize } = req.query;
    const category = req.query.category || '';
    const filterText = (req.query.filterText || '').trim();
    page = parseInt(page) || 1;
    pageSize = parseInt(pageSize) || 10;

    // 2. Construir la base de la query
    let baseQuery = `
      SELECT l.*, c.nombre_centro AS centro
      FROM lugares l
      JOIN centros_asistenciales c ON l.id_centro = c.id_centro
    `;

    // 3. Armar “whereClauses” dinámicamente
    const whereClauses = [];
    const params = [];
    if (category && filterText) {
      // Filtra solo esa categoría
      switch (category) {
        case 'nombre_ambiente':
          whereClauses.push(` l.nombre_ambiente ILIKE $${params.length+1} `);
          params.push(`%${filterText}%`);
          break;
        case 'dependencia':
          whereClauses.push(` l.dependencia ILIKE $${params.length+1} `);
          params.push(`%${filterText}%`);
          break;
        case 'centro':
          whereClauses.push(` c.nombre_centro ILIKE $${params.length+1} `);
          params.push(`%${filterText}%`);
          break;
        default:
          whereClauses.push(`
            (
              l.nombre_ambiente ILIKE $${params.length+1}
              OR l.dependencia ILIKE $${params.length+1}
              OR c.nombre_centro ILIKE $${params.length+1}
            )
          `);
          params.push(`%${filterText}%`);
      }
    } else if (filterText) {
      // Si no hay category, filtrar en TODAS las columnas
      whereClauses.push(`
        (
          l.nombre_ambiente ILIKE $${params.length+1}
          OR l.dependencia ILIKE $${params.length+1}
          OR c.nombre_centro ILIKE $${params.length+1}
        )
      `);
      params.push(`%${filterText}%`);
    }

    // 4. Unir “whereClauses” si existen
    if (whereClauses.length > 0) {
      baseQuery += ' WHERE ' + whereClauses.join(' AND ');
    }

    // 5. Orden, paginación
    baseQuery += ' ORDER BY l.id_lugar ASC ';
    const offset = (page - 1) * pageSize;
    baseQuery += ` LIMIT $${params.length+1} OFFSET $${params.length+2} `;
    params.push(pageSize, offset);

    // 6. Ejecutar la query principal
    const result = await pool.query(baseQuery, params);

    // 7. Consultar total de registros sin filtros (o con)
    // Dependiendo de lo que necesites. Se puede hacer un COUNT(*) from LUGARES
    // o replicar la whereClause. Ejemplo rápido:

    let countQuery = `
      SELECT COUNT(*) as total
      FROM lugares l
      JOIN centros_asistenciales c ON l.id_centro = c.id_centro
    `;
    if (whereClauses.length > 0) {
      countQuery += ' WHERE ' + whereClauses.join(' AND ');
    }
    const countResult = await pool.query(countQuery, params.slice(0, whereClauses.length));
    const totalItems = parseInt(countResult.rows[0].total, 10) || 0;

    // 8. Responder
    successResponse(res, {
      data: result.rows,
      totalItems
    }, 'Lugares obtenidos con paginación y filtros');

  } catch (error) {
    console.error('Error al obtener lugares con filtros/paginación:', error);
    errorResponse(res, error, 'Error al obtener lugares');
  }
};


// -------------------------------------------------------
// Obtener un lugar por ID
// -------------------------------------------------------
const getLugarById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM lugares WHERE id_lugar = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Lugar no encontrado.' });
    }
    successResponse(res, result.rows[0], 'Lugar obtenido correctamente');
  } catch (error) {
    console.error('Error al obtener el lugar:', error);
    errorResponse(res, error, 'Error al obtener el lugar');
  }
};

// -------------------------------------------------------
// Crear nuevo lugar
// -------------------------------------------------------
const createLugar = async (req, res) => {
  const nombre_ambiente = normalizeText(req.body.nombre_ambiente);
  const dependencia = normalizeText(req.body.dependencia);
  const id_centro = Number(req.body.id_centro) || 0;

  if (!nombre_ambiente || !dependencia || !id_centro) {
    return res.status(400).json({ success: false, message: 'Todos los campos son obligatorios.' });
  }

  try {
    const query = `
      INSERT INTO lugares (nombre_ambiente, dependencia, id_centro)
      VALUES ($1, $2, $3) RETURNING *
    `;
    const result = await pool.query(query, [nombre_ambiente, dependencia, id_centro]);
    successResponse(res, result.rows[0], 'Lugar creado exitosamente');
  } catch (error) {
    console.error('Error al insertar el lugar:', error);
    errorResponse(res, error, 'Error al insertar el lugar');
  }
};

// -------------------------------------------------------
// Actualizar lugar existente
// -------------------------------------------------------
const updateLugar = async (req, res) => {
  const { id } = req.params;
  const nombre_ambiente = normalizeText(req.body.nombre_ambiente);
  const dependencia = normalizeText(req.body.dependencia);
  const id_centro = Number(req.body.id_centro) || 0;

  if (!nombre_ambiente || !dependencia || !id_centro) {
    return res.status(400).json({ success: false, message: 'Todos los campos son obligatorios.' });
  }

  try {
    const query = `
      UPDATE lugares
      SET nombre_ambiente = $1, dependencia = $2, id_centro = $3
      WHERE id_lugar = $4
      RETURNING *
    `;
    const result = await pool.query(query, [nombre_ambiente, dependencia, id_centro, id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Lugar no encontrado.' });
    }
    successResponse(res, result.rows[0], 'Lugar actualizado exitosamente');
  } catch (error) {
    console.error('Error al actualizar el lugar:', error);
    errorResponse(res, error, 'Error al actualizar el lugar');
  }
};

// -------------------------------------------------------
// Eliminar lugar
// -------------------------------------------------------
const deleteLugar = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM lugares WHERE id_lugar = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Lugar no encontrado.' });
    }
    successResponse(res, result.rows[0], 'Lugar eliminado correctamente');
  } catch (error) {
    console.error('Error al eliminar el lugar:', error);
    errorResponse(res, error, 'Error al eliminar el lugar');
  }
};

// -------------------------------------------------------
// Buscar lugares por texto (mejorado con validación)
// -------------------------------------------------------
// -------------------------------------------------------
// Buscar lugares por texto (mejorado con validación y log)
// -------------------------------------------------------
const searchLugares = async (req, res) => {
  let { searchText } = req.query;
  searchText = searchText?.trim();

  if (!searchText || searchText.length < 3) {
    return successResponse(res, [], 'Texto de búsqueda muy corto.');
  }

  try {
    const isNumericSearch = /^\d+$/.test(searchText);
    const pattern = isNumericSearch ? `${searchText}%` : `%${searchText}%`;
    const query = isNumericSearch ? `
      SELECT l.*, c.nombre_centro AS centro
      FROM lugares l
      JOIN centros_asistenciales c ON l.id_centro = c.id_centro
      WHERE CAST(l.id_lugar AS TEXT) LIKE $1
      ORDER BY l.id_lugar ASC
      LIMIT 10
    ` : `
      SELECT l.*, c.nombre_centro AS centro
      FROM lugares l
      JOIN centros_asistenciales c ON l.id_centro = c.id_centro
      WHERE l.nombre_ambiente ILIKE $1
         OR l.dependencia ILIKE $1
         OR c.nombre_centro ILIKE $1
      ORDER BY l.id_lugar ASC
      LIMIT 10
    `;
    const values = [pattern];
    const result = await pool.query(query, values);

    console.log('📦 Lugares encontrados:', result.rows.map(r => ({
      ambiente: r.nombre_ambiente,
      dependencia: r.dependencia,
      centro: r.centro
    })));

    return successResponse(res, result.rows, 'Lugares filtrados correctamente');
  } catch (error) {
    console.error('Error al buscar lugares:', error);
    return errorResponse(res, error, 'Error al buscar lugares');
  }
};

module.exports = {
  getAllLugares,   // Para obtener la lista completa (sin paginación, si lo deseas)
  getLugarById,
  createLugar,
  updateLugar,
  deleteLugar,
  searchLugares
};

function normalizeText(value) {
  return String(value || '').trim().toUpperCase();
}
