async function generateNextPapeletaNumber(client) {
  await client.query('SELECT pg_advisory_xact_lock(2026042601)');

  const result = await client.query(`
    SELECT COALESCE(MAX(CAST(SUBSTRING(numero_papeleta, 4) AS INTEGER)), 0) + 1 AS next_number
    FROM papeletas
    WHERE numero_papeleta ~ '^PA-\\d+$';
  `);

  return `PA-${String(result.rows[0].next_number).padStart(4, '0')}`;
}

module.exports = { generateNextPapeletaNumber };
