// Nombre de un centro asistencial: normalización y validación (crear y editar).
// Dos nombres son el mismo centro si coinciden tras normalizar: espacios repetidos → uno,
// sin espacios al principio ni al final y en mayúsculas (como ya se guardan los lugares).

const MAX_NOMBRE_CENTRO = 200; // VARCHAR(200) en el esquema reconstruido

/** Devuelve el nombre normalizado, o null si no es texto. */
function normalizarNombreCentro(valor) {
  if (typeof valor !== 'string') return null;
  return valor.replace(/\s+/g, ' ').trim().toUpperCase();
}

/** Devuelve { nombre } si es válido o { error } con el mensaje para un 400. */
function validarNombreCentro(valor) {
  if (valor === undefined || valor === null) {
    return { error: 'El nombre del centro asistencial es obligatorio.' };
  }
  if (typeof valor !== 'string') {
    return { error: 'El nombre del centro asistencial debe ser un texto.' };
  }
  const nombre = normalizarNombreCentro(valor);
  if (!nombre) {
    return { error: 'El nombre del centro asistencial no puede estar vacío ni contener solo espacios.' };
  }
  if (nombre.length > MAX_NOMBRE_CENTRO) {
    return { error: `El nombre del centro asistencial admite como máximo ${MAX_NOMBRE_CENTRO} caracteres.` };
  }
  return { nombre };
}

module.exports = { MAX_NOMBRE_CENTRO, normalizarNombreCentro, validarNombreCentro };
