#!/usr/bin/env node
// Alta local: la contraseña nunca se acepta en los argumentos del proceso.
require('dotenv').config();
const fs = require('node:fs');
const { emitKeypressEvents } = require('node:readline');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const { loadSecrets, databaseErrors, databaseConfig } = require('../config/env');
const { logError } = require('../utils/securityLog');
const { passwordError } = require('../utils/passwordPolicy');
const { nombreUsuarioError } = require('../utils/usuarioValidation');
const { procesarTecla } = require('../utils/claveTerminal');

async function leerClave() {
    if (!process.stdin.isTTY) {
        let texto = '';
        for await (const parte of process.stdin) {
            texto += parte;
            if (Buffer.byteLength(texto) > 1024) throw new Error('Entrada de contraseña demasiado larga.');
        }
        return texto.replace(/\r?\n$/, '');
    }
    process.stderr.write('Contraseña (sin eco): ');
    emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    return new Promise((resolve, reject) => {
        let clave = '';
        const terminar = (error) => {
            process.stdin.setRawMode(false);
            process.stdin.removeListener('keypress', tecla);
            process.stdin.pause();
            process.stderr.write('\n');
            if (error) reject(error); else resolve(clave);
        };
        const tecla = (texto, key = {}) => {
            const resultado = procesarTecla(clave, texto, key);
            if (resultado.accion === 'cancelar') return terminar(new Error('Operación cancelada.'));
            if (resultado.accion === 'terminar') return terminar();
            clave = resultado.clave;
            if (Buffer.byteLength(clave) > 1024) terminar(new Error('Entrada de contraseña demasiado larga.'));
        };
        process.stdin.on('keypress', tecla);
        process.stdin.resume();
    });
}

async function main() {
    const [nombre, opcion, archivo, ...resto] = process.argv.slice(2);
    if (nombre === undefined || nombre.startsWith('--') || resto.length ||
        (opcion !== undefined && (opcion !== '--clave-archivo' || !archivo))) {
        throw new Error('Uso: node scripts/crear-admin.js nombre [--clave-archivo ruta]. La contraseña se lee de stdin o del archivo.');
    }
    const problemaNombre = nombreUsuarioError(nombre);
    if (problemaNombre) throw new Error(problemaNombre);
    const errores = [...loadSecrets(), ...databaseErrors()];
    const minimo = Number(process.env.PASSWORD_MIN_LENGTH || 10);
    if (!Number.isInteger(minimo) || minimo < 10 || minimo > 72) errores.push('PASSWORD_MIN_LENGTH debe ser un entero entre 10 y 72.');
    if (errores.length) throw new Error(errores.join(' '));
    const clave = archivo ? fs.readFileSync(archivo, 'utf8').replace(/\r?\n$/, '') : await leerClave();
    const problema = passwordError(nombre, clave);
    if (problema) throw new Error(problema);
    // Operación administrativa: conserva la configuración sin límites del pool HTTP.
    const pool = new Pool(databaseConfig());
    pool.on('error', error => logError('Error en una conexión administrativa inactiva', error));
    try {
        const existe = await pool.query('SELECT 1 FROM usuarios WHERE lower(nombre_usuario) = lower($1)', [nombre]);
        if (existe.rowCount) throw new Error('El nombre de usuario ya existe. No se modificó la cuenta.');
        // El rol 1 es el administrador en el contrato actual de autenticación.
        const rol = await pool.query('SELECT 1 FROM roles WHERE id_rol = 1');
        if (!rol.rowCount) throw new Error('No existe el rol de administrador (id_rol 1).');
        const hash = await bcrypt.hash(clave, 10);
        await pool.query('INSERT INTO usuarios (nombre_usuario, contrasena, id_rol, activo) VALUES ($1, $2, 1, true)', [nombre, hash]);
        console.log('Administrador creado correctamente.');
    } catch (error) {
        if (error.code === '23505') throw new Error('El nombre de usuario ya existe. No se modificó la cuenta.');
        // Los errores de pg pueden contener datos o secretos: nunca se imprimen.
        if (error.code) throw new Error('No se pudo crear el administrador. Compruebe la conexión y el esquema.');
        throw error;
    } finally {
        await pool.end();
    }
}

main().catch((error) => {
    const mensaje = error.code ? 'No se pudo leer el archivo o completar la operación.' : error.message;
    console.error(mensaje);
    process.exitCode = 1;
});
