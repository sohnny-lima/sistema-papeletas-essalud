#!/usr/bin/env node
// El esquema es reconstruido: no valida ni adopta automáticamente la base real.
const crypto = require('node:crypto');
const { fs, path, DB_DIR, TABLAS, fallo, terminar, conectar, transaccion } = require('./db-comun');
const version = require('../package.json').version;
function migraciones(dir = path.join(DB_DIR, 'migraciones')) {
    return fs.readdirSync(dir).filter(n => /^\d+_[\w-]+\.sql$/.test(n)).sort().map(nombre => {
        const sql = fs.readFileSync(path.join(dir, nombre), 'utf8');
        // La suma ignora CRLF/LF: Git en Windows (core.autocrlf) y en Linux o Docker dan finales distintos.
        const normalizado = sql.replace(/\r\n/g, '\n');
        return { nombre, sql, suma: crypto.createHash('sha256').update(normalizado).digest('hex') };
    });
}
// Conserva los archivos originales; el registro y el SQL se confirman juntos.
function cuerpo(sql) { return sql.replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, ''); }
async function comprobarObjeto(c, m) {
    const objetos = [...m.sql.matchAll(/CREATE UNIQUE INDEX IF NOT EXISTS\s+(\w+)\s+ON\s+(\w+)\s*\(([\s\S]*?)\);/g)];
    if (!objetos.length) fallo('La migración no tiene una comprobación de adopción definida.');
    for (const [, nombre, tabla, expresion] of objetos) {
        const { rows } = await c.query(`SELECT i.indisunique, i.indisvalid, i.indisready,
            pg_get_indexdef(i.indexrelid, 1, true) AS expresion, t.relname AS tabla,
            i.indnatts, i.indpred IS NULL AS completo
            FROM pg_index i JOIN pg_class x ON x.oid=i.indexrelid JOIN pg_class t ON t.oid=i.indrelid
            JOIN pg_namespace n ON n.oid=x.relnamespace WHERE n.nspname='public' AND x.relname=$1`, [nombre]);
        const normalizar = s => s.toLowerCase().replace(/::text/g, '').replace(/[\s()]/g, '');
        const r = rows[0];
        if (!r || !r.indisunique || !r.indisvalid || !r.indisready || !r.completo || r.indnatts !== 1 || r.tabla !== tabla || normalizar(r.expresion) !== normalizar(expresion)) {
            fallo('No se puede registrar: el índice esperado falta o tiene otra definición (' + nombre + ').');
        }
    }
    if (m.nombre === '003_usuarios_estado_sesion.sql') {
        const esperadas = { activo: ['boolean', 'true'], version_sesion: ['integer', '0'], fecha_creacion: ['timestamp with time zone', 'now()'] };
        const { rows } = await c.query("SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='usuarios'");
        for (const [nombre, [tipo, defecto]] of Object.entries(esperadas)) {
            const col = rows.find(r => r.column_name === nombre);
            if (!col || col.data_type !== tipo || col.is_nullable !== 'NO' || col.column_default !== defecto) {
                fallo('No se puede registrar: columna esperada ausente o con otra definición (usuarios.' + nombre + ').');
            }
        }
    }
}
async function ejecutar(c, args, lista = migraciones()) {
    const modo = args[0];
    if (modo === '--conceder-app') {
        if (args.length !== 2) fallo('Uso: migrar.js --conceder-app rol');
        return require('./conceder-app').concederApp(c, args[1]);
    }
    if (args.length && !(['--estado', '--inicializar', '--registrar-existentes', '--catalogos-iniciales'].includes(modo)) ||
        (modo === '--registrar-existentes' ? args.length !== 2 : args.length > 1)) fallo('Uso: migrar.js [--estado | --inicializar | --registrar-existentes nombre1.sql,nombre2.sql | --catalogos-iniciales]');
    const existe = (await c.query("SELECT to_regclass('public.esquema_migraciones') AS tabla")).rows[0].tabla;
    const aplicadas = existe ? (await c.query('SELECT nombre, suma_sha256, fecha_aplicacion, version_aplicacion FROM esquema_migraciones ORDER BY nombre')).rows : [];
    for (const a of aplicadas) {
        const m = lista.find(m => m.nombre === a.nombre);
        if (!m || m.suma !== a.suma_sha256) fallo('Suma alterada o archivo ausente de una migración aplicada: ' + a.nombre);
    }
    if (modo === '--estado') {
        for (const m of lista) {
            const a = aplicadas.find(a => a.nombre === m.nombre);
            console.log(`${a ? 'Aplicada' : 'Pendiente'}: ${m.nombre}${a ? ' | ' + a.fecha_aplicacion.toISOString() + ' | versión ' + a.version_aplicacion : ''}`);
        }
        return;
    }
    if (modo === '--inicializar') {
        await transaccion(c, async () => {
            const { rows } = await c.query('SELECT tablename FROM pg_tables WHERE tablename=ANY($1)', [TABLAS]);
            if (rows.length) fallo('Inicialización rechazada: ya existen tablas de la aplicación. Compare y adopte la base existente.');
            await c.query(fs.readFileSync(path.join(DB_DIR, 'esquema/001_esquema_inicial.sql'), 'utf8'));
        });
        console.log('Esquema reconstruido inicializado. Ejecute migrar.js para aplicar las migraciones.');
        return;
    }
    if (modo === '--catalogos-iniciales') {
        await transaccion(c, async () => {
            for (const t of TABLAS) {
                if ((await c.query('SELECT 1 FROM ' + t + ' LIMIT 1')).rowCount) fallo('Catálogos iniciales rechazados: la instalación debe estar vacía.');
            }
            // Valores del contrato existente; sin usuarios ni datos de demostración.
            await c.query("INSERT INTO roles(id_rol,nombre_rol) VALUES (1,'ADMINISTRADOR'),(2,'USUARIO'); SELECT setval('roles_id_rol_seq',2)");
            await c.query("INSERT INTO tipo_formulario(nombre) VALUES ('TOMA DE INVENTARIO'),('CUADRO DE ASIGNACION'),('DESPLAZAMIENTO'),('MANTENIMIENTO'),('DEVOLUCION'); INSERT INTO estados_papeletas(nombre_estado) VALUES ('REGISTRADA'),('ANULADA')");
        });
        console.log('Catálogos iniciales creados; cree ahora el administrador.');
        return;
    }
    const seleccion = modo === '--registrar-existentes' ? args[1].split(',') : lista.map(m => m.nombre);
    if (!seleccion.length || seleccion.some(n => !lista.some(m => m.nombre === n)) || new Set(seleccion).size !== seleccion.length) fallo('Lista de migraciones desconocida o repetida. Use los nombres completos separados por comas.');
    await c.query(`CREATE TABLE IF NOT EXISTS esquema_migraciones (
        nombre TEXT PRIMARY KEY, suma_sha256 CHAR(64) NOT NULL,
        fecha_aplicacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, version_aplicacion TEXT NOT NULL)`);
    for (const m of lista.filter(m => seleccion.includes(m.nombre))) {
        if (aplicadas.some(a => a.nombre === m.nombre)) { console.log('Ya aplicada: ' + m.nombre); continue; }
        await transaccion(c, async () => {
            if (modo === '--registrar-existentes') await comprobarObjeto(c, m);
            else {
                try { await c.query(cuerpo(m.sql)); }
                catch (error) {
                    // Solo la comprobación propia de U1 es imprimible: nunca detail ni errores arbitrarios.
                    if (m.nombre === '003_usuarios_estado_sesion.sql' && error.code === 'P0001' && error.message.startsWith('U1 migración 003:')) fallo(error.message);
                    throw error;
                }
                await comprobarObjeto(c, m);
            }
            await c.query('INSERT INTO esquema_migraciones(nombre,suma_sha256,version_aplicacion) VALUES ($1,$2,$3)', [m.nombre, m.suma, version]);
        });
        console.log((modo === '--registrar-existentes' ? 'Registrada: ' : 'Aplicada: ') + m.nombre);
    }
}
if (require.main === module) conectar(c => ejecutar(c, process.argv.slice(2)), process.argv[2] !== '--estado').catch(terminar);
module.exports = { ejecutar, migraciones, cuerpo };
