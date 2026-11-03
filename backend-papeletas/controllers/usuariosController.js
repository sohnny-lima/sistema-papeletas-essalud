const pool = require('../config/database');
const bcrypt = require('bcrypt');
const { passwordError } = require('../utils/passwordPolicy');
const { nombreUsuarioError } = require('../utils/usuarioValidation');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const { safeRollback, releaseClient } = require('../utils/transaccion');
const { rolDesdeId, nombreRol } = require('../utils/roles');
const { esIdValido } = require('../utils/idValidation');
const { getPagination } = require('../utils/pagination');

// U2: ni el hash ni la versión de sesión salen de este módulo.
const CAMPOS = 'id_usuario, nombre_usuario, id_rol, activo, fecha_creacion';
const PROPIA = 'No puede cambiar su propio rol ni desactivar su propia cuenta.';
const ULTIMO = 'Debe quedar al menos un administrador activo.';
const DUPLICADO = 'Ya existe un usuario con ese nombre.';
function objeto(usuario) {
    const rol = rolDesdeId(usuario.id_rol);
    return { ...usuario, rol, rolNombre: nombreRol(rol) };
}
function rechazar(status, message) { throw Object.assign(new Error(message), { status }); }
function responderError(res, error) {
    if (error.status) return errorResponse(res, null, error.message, error.status);
    return errorResponse(res, error, 'No se pudo completar la operación de usuarios', undefined, 'usuarios');
}
function validarRol(id) {
    if (!esIdValido(id)) {
        rechazar(400, 'El rol debe ser un entero positivo válido.');
    }
    return Number(id);
}
async function comprobarRol(c, id) {
    if (!(await c.query('SELECT 1 FROM roles WHERE id_rol = $1', [id])).rowCount) rechazar(400, 'El rol no existe.');
}
async function comprobarNombre(c, nombre, id = null) {
    if ((await c.query('SELECT 1 FROM usuarios WHERE lower(nombre_usuario) = lower($1) AND ($2::integer IS NULL OR id_usuario <> $2)', [nombre, id])).rowCount) rechazar(409, DUPLICADO);
}
async function cuenta(c, id, bloquear = false) {
    const r = await c.query(`SELECT ${CAMPOS} FROM usuarios WHERE id_usuario = $1${bloquear ? ' FOR UPDATE' : ''}`, [id]);
    if (!r.rowCount) rechazar(404, 'Usuario no encontrado.');
    return r.rows[0];
}
// Orden único: consultivo -> objetivo -> recuento. READ COMMITTED permite
// al segundo escritor contar el resultado ya confirmado por el primero.
async function escribir(res, accion, mensaje) {
    let c;
    try {
        c = await pool.connect();
        await c.query('BEGIN ISOLATION LEVEL READ COMMITTED');
        await c.query('SELECT pg_advisory_xact_lock(704008, 1)');
        const usuario = await accion(c);
        await c.query('COMMIT');
        return successResponse(res, objeto(usuario), mensaje);
    } catch (error) {
        if (c) await safeRollback(c, error);
        return responderError(res, error);
    } finally { releaseClient(c); }
}
async function protegerUltimo(c, anterior, rol, activo) {
    if (anterior.id_rol === 1 && anterior.activo && (rol !== 1 || !activo)) {
        const r = await c.query('SELECT count(*)::int AS total FROM usuarios WHERE id_rol = 1 AND activo');
        if (r.rows[0].total <= 1) rechazar(409, ULTIMO);
    }
}
const getAllUsuarios = async (req, res) => {
    let c;
    try {
        const estado = req.query.estado ?? 'todos';
        if (!['activos', 'inactivos', 'todos'].includes(estado)) rechazar(400, 'El estado debe ser activos, inactivos o todos.');
        const { page, pageSize, offset } = getPagination(req.query);
        // U2 c009-2: la búsqueda es literal, incluidos los metacaracteres de LIKE.
        const search = (typeof req.query.search === 'string' ? req.query.search : '').replace(/[\\%_]/g, '\\$&');
        const parametros = [search, estado === 'todos' ? null : estado === 'activos'];
        const filtro = `WHERE nombre_usuario ILIKE '%' || $1 || '%' ESCAPE E'\\\\' AND ($2::boolean IS NULL OR activo = $2)`;
        c = await pool.connect();
        // U2 c009-1: la página y el total comparten instantánea, también si no hay filas.
        await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const total = await c.query(`SELECT count(*)::int AS total FROM usuarios ${filtro}`, parametros);
        const result = await c.query(`SELECT ${CAMPOS} FROM usuarios ${filtro} ORDER BY lower(nombre_usuario), id_usuario LIMIT $3 OFFSET $4`, [...parametros, pageSize, offset]);
        await c.query('COMMIT');
        const totalItems = total.rows[0].total;
        return successResponse(res, { data: result.rows.map(objeto), totalItems, totalPages: Math.ceil(totalItems / pageSize), currentPage: page }, 'Usuarios obtenidos exitosamente');
    } catch (error) {
        if (c) await safeRollback(c, error);
        return responderError(res, error);
    } finally { releaseClient(c); }
};
const getUsuarioById = async (req, res) => {
    try { return successResponse(res, objeto(await cuenta(pool, req.params.id)), 'Usuario obtenido exitosamente'); }
    catch (error) { return responderError(res, error); }
};
const getPoliticaContrasena = (req, res) => successResponse(res, {
    longitudMinima: Number(process.env.PASSWORD_MIN_LENGTH || 10), longitudMaximaBytes: 72,
}, 'Política de contraseña');
const createUsuario = async (req, res) => {
    try {
        const { nombre_usuario, contrasena, id_rol } = req.body || {};
        const problema = nombreUsuarioError(nombre_usuario) || passwordError(nombre_usuario, contrasena);
        if (problema) rechazar(400, problema);
        const rol = validarRol(id_rol);
        await comprobarRol(pool, rol);
        await comprobarNombre(pool, nombre_usuario);
        const hash = await bcrypt.hash(contrasena, 10);
        return escribir(res, async c => {
            await comprobarRol(c, rol);
            await comprobarNombre(c, nombre_usuario);
            return (await c.query(`INSERT INTO usuarios(nombre_usuario, contrasena, id_rol, activo) VALUES ($1, $2, $3, true) RETURNING ${CAMPOS}`, [nombre_usuario, hash, rol])).rows[0];
        }, 'Usuario creado exitosamente');
    } catch (error) { return responderError(res, error); }
};
function validarEdicion(anterior, nombre, rol, idSolicitante) {
    // Las cuentas históricas solo cumplen el formato nuevo al renombrarlas.
    if (nombre !== anterior.nombre_usuario) {
        const problema = nombreUsuarioError(nombre);
        if (problema) rechazar(400, problema);
    }
    if (anterior.id_usuario === idSolicitante && rol !== anterior.id_rol) rechazar(409, PROPIA);
}
const updateUsuario = async (req, res) => {
    try {
        const { nombre_usuario, contrasena, id_rol } = req.body || {};
        const rol = validarRol(id_rol);
        const cambiaClave = contrasena !== undefined && contrasena !== null && contrasena !== '';
        if (cambiaClave) {
            if (typeof nombre_usuario !== 'string') rechazar(400, 'El nombre de usuario debe ser texto.');
            const problema = passwordError(nombre_usuario, contrasena);
            if (problema) rechazar(400, problema);
        }
        const previo = await cuenta(pool, req.params.id);
        validarEdicion(previo, nombre_usuario, rol, req.usuario.idUsuario);
        await comprobarRol(pool, rol);
        await comprobarNombre(pool, nombre_usuario, previo.id_usuario);
        const hash = cambiaClave ? await bcrypt.hash(contrasena, 10) : null;
        return escribir(res, async c => {
            const anterior = await cuenta(c, req.params.id, true);
            validarEdicion(anterior, nombre_usuario, rol, req.usuario.idUsuario);
            await comprobarRol(c, rol);
            await protegerUltimo(c, anterior, rol, anterior.activo);
            await comprobarNombre(c, nombre_usuario, anterior.id_usuario);
            const incremento = rol !== anterior.id_rol || cambiaClave ? 1 : 0;
            return (await c.query(`UPDATE usuarios SET nombre_usuario = $1, id_rol = $2,
                contrasena = COALESCE($3, contrasena), version_sesion = version_sesion + $4
                WHERE id_usuario = $5 RETURNING ${CAMPOS}`, [nombre_usuario, rol, hash, incremento, anterior.id_usuario])).rows[0];
        }, 'Usuario actualizado exitosamente');
    } catch (error) { return responderError(res, error); }
};
const cambiarEstado = async (req, res) => {
    if (typeof req.body?.activo !== 'boolean') return errorResponse(res, null, 'El estado activo debe ser un booleano.', 400);
    return escribir(res, async c => {
        const anterior = await cuenta(c, req.params.id, true);
        const activo = req.body.activo;
        if (anterior.id_usuario === req.usuario.idUsuario && !activo) rechazar(409, PROPIA);
        await protegerUltimo(c, anterior, anterior.id_rol, activo);
        return (await c.query(`UPDATE usuarios SET activo = $1, version_sesion = version_sesion + $2 WHERE id_usuario = $3 RETURNING ${CAMPOS}`,
            [activo, activo !== anterior.activo ? 1 : 0, anterior.id_usuario])).rows[0];
    }, 'Estado del usuario actualizado exitosamente');
};
const deleteUsuario = async (req, res) => {
    try {
        await cuenta(pool, req.params.id);
        rechazar(409, 'Las cuentas no se eliminan: desactívela para conservar su historial.');
    } catch (error) { return responderError(res, error); }
};
module.exports = { getAllUsuarios, getUsuarioById, getPoliticaContrasena, createUsuario, updateUsuario, cambiarEstado, deleteUsuario };
