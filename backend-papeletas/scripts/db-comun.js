// Herramientas explícitas de operación sobre el esquema reconstruido.
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { databaseConfig } = require('../config/env');
const { logError } = require('../utils/securityLog');
const DB_DIR = path.resolve(__dirname, '../db');
const TABLAS = ['roles', 'usuarios', 'centros_asistenciales', 'lugares', 'trabajadores', 'equipos', 'tipo_formulario', 'estados_papeletas', 'papeletas', 'papeleta_equipos'];
function fallo(mensaje) { const error = new Error(mensaje); error.operacion = true; throw error; }
function terminar(error) {
    if (error.operacion) console.error(error.message);
    else { logError('Operación de base de datos fallida', error); console.error('No se pudo completar la operación. Revise conexión, permisos y esquema.'); }
    process.exitCode = 1;
}
async function conectar(fn, escritura = true) {
    let config;
    // Errores de configuración (secreto ilegible, variable ausente): solo nombran variables, sin valores.
    try { config = databaseConfig(); } catch (error) { fallo('Configuración inválida: ' + error.message); }
    const cliente = new Client(config);
    try {
        await cliente.connect();
        await cliente.query('SET search_path TO public');
        if (escritura) {
            const { rows } = await cliente.query('SELECT pg_try_advisory_lock(704004, 1) AS libre');
            if (!rows[0].libre) fallo('Hay otra operación de esquema o demostración en marcha.');
        }
        return await fn(cliente);
    } finally { await cliente.end(); }
}
async function transaccion(cliente, fn) {
    await cliente.query('BEGIN');
    try { const resultado = await fn(); await cliente.query('COMMIT'); return resultado; }
    catch (error) { await cliente.query('ROLLBACK'); throw error; }
}
module.exports = { fs, path, DB_DIR, TABLAS, fallo, terminar, conectar, transaccion };
