async function existsById(client, tableName, idColumn, id) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return false;
  }

  const result = await client.query(
    `SELECT 1 FROM ${tableName} WHERE ${idColumn} = $1 LIMIT 1`,
    [numericId]
  );
  return result.rows.length > 0;
}

async function ensureIdsExist(client, tableName, idColumn, ids, label) {
  const uniqueIds = [...new Set(ids.map(Number))];

  if (uniqueIds.some(id => !Number.isInteger(id) || id <= 0)) {
    return `${label} contiene identificadores inválidos.`;
  }

  const result = await client.query(
    `SELECT ${idColumn} FROM ${tableName} WHERE ${idColumn} = ANY($1::int[])`,
    [uniqueIds]
  );
  const found = new Set(result.rows.map(row => Number(row[idColumn])));
  const missing = uniqueIds.filter(id => !found.has(id));

  if (missing.length > 0) {
    return `${label} no existe o fue eliminado: ${missing.join(', ')}.`;
  }

  return null;
}

module.exports = { existsById, ensureIdsExist };
