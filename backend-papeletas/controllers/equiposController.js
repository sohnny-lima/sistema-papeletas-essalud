const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');

// Obtener equipos con paginación y filtros
const getAllEquipos = async (req, res) => {
  const { page, pageSize, offset } = getPagination(req.query);
  const category = req.query.category || '';
  const filterText = (req.query.filterText || '').trim();

  try {
    let query = 'SELECT * FROM equipos';
    let countQuery = 'SELECT COUNT(*) FROM equipos';
    const params = [];
    let filterCondition = '';
    const validCategories = ['cod_patrimonial', 'descripcion', 'marca', 'serie', 'modelo'];

    if (filterText) {
      const isNumericSearch = /^\d+$/.test(filterText);
      const pattern = isNumericSearch ? `${filterText}%` : `%${filterText}%`;

      if (!validCategories.includes(category)) {
        filterCondition = isNumericSearch
          ? `
            WHERE cod_patrimonial ILIKE $1
               OR serie ILIKE $1
          `
          : `
            WHERE cod_patrimonial ILIKE $1
               OR descripcion ILIKE $1
               OR marca ILIKE $1
               OR serie ILIKE $1
               OR modelo ILIKE $1
          `;
      } else {
        filterCondition = ` WHERE ${category} ILIKE $1`;
      }
      params.push(pattern);
    }

    // Query paginada
    const paginatedQuery = `
      ${query}
      ${filterCondition}
      ORDER BY id_equipo ASC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `;
    // Conteo total
    const countParams = filterCondition ? [params[0]] : [];
    const totalCountResult = await pool.query(countQuery + filterCondition, countParams);
    const totalItems = parseInt(totalCountResult.rows[0].count, 10);

    params.push(pageSize, offset);

    const result = await pool.query(paginatedQuery, params);

    return successResponse(
      res,
      {
        data: result.rows,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
        currentPage: page,
      },
      'Equipos obtenidos exitosamente'
    );
  } catch (error) {
    console.error('Error al obtener los equipos:', error);
    return errorResponse(res, error, 'Error al obtener los equipos');
  }
};

// Omito el resto de funciones (getEquipoById, createEquipo, updateEquipo, deleteEquipo)
// que permanecen igual a tu código, con la salvedad de utilizar successResponse y errorResponse.


// Obtener un equipo por ID
const getEquipoById = async (req, res) => {
  const id = req.params.id;

  try {
    const result = await pool.query('SELECT * FROM equipos WHERE id_equipo = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Equipo no encontrado.' });
    }
    successResponse(res, result.rows[0], 'Equipo obtenido exitosamente');
  } catch (error) {
    console.error('Error al obtener el equipo:', error);
    errorResponse(res, error, 'Error al obtener el equipo');
  }
};

// Crear un nuevo equipo
const createEquipo = async (req, res) => {
  const cod_patrimonial = normalizeText(req.body.cod_patrimonial);
  const descripcion = normalizeText(req.body.descripcion);
  const marca = normalizeText(req.body.marca);
  const serie = normalizeText(req.body.serie);
  const modelo = normalizeText(req.body.modelo);

  if (!cod_patrimonial || !descripcion || !marca || !serie || !modelo) {
    return res
      .status(400)
      .json({ success: false, message: 'Todos los campos del equipo son obligatorios.' });
  }

  if (!/^\d{4,20}$/.test(cod_patrimonial)) {
    return res.status(400).json({ success: false, message: 'El código patrimonial debe tener entre 4 y 20 dígitos.' });
  }

  try {
    const duplicate = await pool.query(
      'SELECT 1 FROM equipos WHERE cod_patrimonial = $1 LIMIT 1',
      [cod_patrimonial]
    );
    if (duplicate.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Ya existe un equipo con ese código patrimonial.' });
    }

    const query = `
      INSERT INTO equipos (cod_patrimonial, descripcion, marca, serie, modelo)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const result = await pool.query(query, [cod_patrimonial, descripcion, marca, serie, modelo]);

    successResponse(res, result.rows[0], 'Equipo creado exitosamente');
  } catch (error) {
    console.error('Error al crear el equipo:', error);
    errorResponse(res, error, 'Error al crear el equipo');
  }
};

// Actualizar un equipo existente
const updateEquipo = async (req, res) => {
  const id = req.params.id;
  const cod_patrimonial = normalizeText(req.body.cod_patrimonial);
  const descripcion = normalizeText(req.body.descripcion);
  const marca = normalizeText(req.body.marca);
  const serie = normalizeText(req.body.serie);
  const modelo = normalizeText(req.body.modelo);

  if (!cod_patrimonial || !descripcion || !marca || !serie || !modelo) {
    return res
      .status(400)
      .json({ success: false, message: 'Todos los campos del equipo son obligatorios.' });
  }

  if (!/^\d{4,20}$/.test(cod_patrimonial)) {
    return res.status(400).json({ success: false, message: 'El código patrimonial debe tener entre 4 y 20 dígitos.' });
  }

  try {
    const duplicate = await pool.query(
      'SELECT 1 FROM equipos WHERE cod_patrimonial = $1 AND id_equipo <> $2 LIMIT 1',
      [cod_patrimonial, id]
    );
    if (duplicate.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Ya existe otro equipo con ese código patrimonial.' });
    }

    const query = `
      UPDATE equipos 
      SET cod_patrimonial = $1, descripcion = $2, marca = $3, serie = $4, modelo = $5
      WHERE id_equipo = $6
      RETURNING *
    `;
    const result = await pool.query(query, [
      cod_patrimonial,
      descripcion,
      marca,
      serie,
      modelo,
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Equipo no encontrado.' });
    }

    successResponse(res, result.rows[0], 'Equipo actualizado exitosamente');
  } catch (error) {
    console.error('Error al actualizar el equipo:', error);
    errorResponse(res, error, 'Error al actualizar el equipo');
  }
};

// Eliminar un equipo
const deleteEquipo = async (req, res) => {
  const id = req.params.id;

  try {
    const result = await pool.query('DELETE FROM equipos WHERE id_equipo = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Equipo no encontrado.' });
    }

    successResponse(res, result.rows[0], 'Equipo eliminado exitosamente');
  } catch (error) {
    console.error('Error al eliminar el equipo:', error);
    errorResponse(res, error, 'Error al eliminar el equipo');
  }
};

module.exports = {
  getAllEquipos,
  getEquipoById,
  createEquipo,
  updateEquipo,
  deleteEquipo,
};

function normalizeText(value) {
  return String(value || '').trim().toUpperCase();
}
