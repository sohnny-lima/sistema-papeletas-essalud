#!/usr/bin/env node
// Exclusivo para bases desechables con el esquema reconstruido.
const { fs, path, DB_DIR, TABLAS, fallo, terminar, conectar, transaccion } = require('./db-comun');
async function ejecutar(c, args) {
    if (args.length !== 1 || args[0] !== '--confirmar-demo') fallo('Debe indicar únicamente --confirmar-demo. Nunca cargar demostración en producción.');
    await transaccion(c, async () => {
        // Bloquea todas las tablas para evitar altas concurrentes durante la comprobación.
        await c.query('LOCK TABLE ' + TABLAS.join(',') + ' IN EXCLUSIVE MODE');
        for (const t of TABLAS) {
            if ((await c.query('SELECT 1 FROM ' + t + ' LIMIT 1')).rowCount) fallo('Carga rechazada: la base debe estar vacía, sin papeletas, usuarios ni catálogos previos.');
        }
        await c.query(fs.readFileSync(path.join(DB_DIR, 'demo/datos-demo.sql'), 'utf8'));
    });
    console.log('Demostración ficticia cargada sobre el esquema reconstruido.');
}
if (require.main === module) conectar(c => ejecutar(c, process.argv.slice(2))).catch(terminar);
module.exports = { ejecutar };
