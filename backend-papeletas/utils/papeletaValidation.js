// Validación de los datos de una papeleta (crear y editar).
// Las reglas de negocio (origen ≠ destino, al menos un equipo, sin duplicados) son las
// mismas que ya aplicaba la interfaz en papeletas.component.ts → validatePapeleta().

const { ensureIdsExist } = require('./dbValidation');

/** Convierte a entero positivo; devuelve null si no lo es (acepta 3 y "3", no 1.5, 0, "abc"). */
function toPositiveInt(value) {
    if (typeof value === 'number') {
        return Number.isInteger(value) && value > 0 ? value : null;
    }
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
        const n = Number(value.trim());
        return Number.isSafeInteger(n) && n > 0 ? n : null;
    }
    return null;
}

/** Valida una fecha 'YYYY-MM-DD' (se admite un sufijo de hora ISO, que se descarta). */
function parseFecha(value) {
    if (typeof value !== 'string') return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(value.trim());
    if (!match) return null;
    const [, y, m, d] = match.map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const valid = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
    return valid ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

const ID_FIELDS = {
    id_tipo_formulario: 'Tipo de formulario',
    id_trabajador_origen: 'Trabajador origen',
    id_trabajador_destino: 'Trabajador destino',
    id_lugar_origen: 'Lugar origen',
    id_lugar_destino: 'Lugar destino',
};

/**
 * Valida el formato del cuerpo. Devuelve { errors: string[], value }.
 * @param {object} body
 * @param {{ requireFecha: boolean }} options  En edición la fecha es opcional (si no llega, se conserva).
 */
function validatePapeletaBody(body, { requireFecha }) {
    const errors = [];
    const value = {};
    const input = body && typeof body === 'object' ? body : {};

    for (const [field, label] of Object.entries(ID_FIELDS)) {
        if (input[field] === undefined || input[field] === null || input[field] === '') {
            errors.push(`${label} es obligatorio.`);
            continue;
        }
        const id = toPositiveInt(input[field]);
        if (id === null) errors.push(`${label} debe ser un identificador entero positivo.`);
        else value[field] = id;
    }

    const fechaProvided = input.fecha !== undefined && input.fecha !== null;
    if (fechaProvided || requireFecha) {
        const fecha = parseFecha(input.fecha);
        if (!fechaProvided || input.fecha === '') errors.push('La fecha es obligatoria.');
        else if (fecha === null) errors.push('La fecha no es válida (formato esperado AAAA-MM-DD).');
        else value.fecha = fecha;
    }

    const equipos = input.equipmentIds;
    if (!Array.isArray(equipos) || equipos.length === 0) {
        errors.push('Debe asociar al menos un equipo.');
    } else {
        const ids = equipos.map(toPositiveInt);
        if (ids.some((id) => id === null)) {
            errors.push('La lista de equipos contiene identificadores inválidos.');
        } else if (new Set(ids).size !== ids.length) {
            errors.push('Hay equipos duplicados en la papeleta.');
        } else {
            value.equipmentIds = ids;
        }
    }

    if (value.id_trabajador_origen && value.id_trabajador_origen === value.id_trabajador_destino) {
        errors.push('El trabajador origen y el trabajador destino no pueden ser el mismo.');
    }
    if (value.id_lugar_origen && value.id_lugar_origen === value.id_lugar_destino) {
        errors.push('El lugar origen y el lugar destino no pueden ser el mismo.');
    }

    return { errors, value };
}

/** Comprueba que existen las referencias. Devuelve un mensaje de error o null. */
async function checkPapeletaReferences(client, value) {
    const checks = [
        ['tipo_formulario', 'id_tipo_formulario', [value.id_tipo_formulario], 'El tipo de formulario'],
        ['trabajadores', 'id_trabajador', [value.id_trabajador_origen, value.id_trabajador_destino], 'El trabajador'],
        ['lugares', 'id_lugar', [value.id_lugar_origen, value.id_lugar_destino], 'El lugar'],
        ['equipos', 'id_equipo', value.equipmentIds, 'El equipo'],
    ];
    const problems = [];
    for (const [table, column, ids, label] of checks) {
        const problem = await ensureIdsExist(client, table, column, ids, label);
        if (problem) problems.push(problem);
    }
    return problems.length > 0 ? problems.join(' ') : null;
}

module.exports = { toPositiveInt, parseFecha, validatePapeletaBody, checkPapeletaReferences };
