// g012 #1: provisión explícita del usuario de servicio, sin contraseña en argumentos.
const crypto = require('node:crypto');
const fs = require('node:fs');
const { fallo, transaccion } = require('./db-comun');

function verificadorScram(clave) {
    // SCRAM-SHA-256 (RFC 5802/7677). Misma normalización SASLprep del driver pg.
    const normalizada = clave.replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
        .replace(/[\u00AD\u034F\u1806\u180B\u180C\u180D\u200C\u200D\u2060\uFE00-\uFE0F\uFEFF]/g, '').normalize('NFKC');
    const sal = crypto.randomBytes(16), iteraciones = 4096;
    const derivada = crypto.pbkdf2Sync(normalizada, sal, iteraciones, 32, 'sha256');
    const cliente = crypto.createHmac('sha256', derivada).update('Client Key').digest();
    const almacenada = crypto.createHash('sha256').update(cliente).digest('base64');
    const servidor = crypto.createHmac('sha256', derivada).update('Server Key').digest('base64');
    return `SCRAM-SHA-256$${iteraciones}:${sal.toString('base64')}$${almacenada}:${servidor}`;
}
async function concederApp(c, rol, env = process.env) {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(rol || '') || /^(pg_|postgres$|public$)/.test(rol)) fallo('Rol API inválido; use un nombre propio en minúsculas.');
    let clave;
    try { clave = fs.readFileSync(env.APP_DB_PASSWORD_FILE, 'utf8').replace(/\r?\n$/, ''); }
    catch { fallo('APP_DB_PASSWORD_FILE no se puede leer.'); }
    if (!clave || clave.includes('\0')) fallo('El secreto del rol API debe ser no vacío y sin NUL.');
    const verificador = verificadorScram(clave);
    await transaccion(c, async () => {
        const { rows: [actual] } = await c.query('SELECT current_user AS propietario, current_database() AS base');
        if (rol === actual.propietario) fallo('El rol API debe ser distinto del propietario.');
        const { rows: [existente] } = await c.query(`SELECT oid, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname=$1`, [rol]);
        if (existente) {
            const relaciones = await c.query(`SELECT 1 FROM pg_auth_members WHERE member=$1 OR roleid=$1
                UNION ALL SELECT 1 FROM pg_class WHERE relowner=$1
                UNION ALL SELECT 1 FROM pg_namespace WHERE nspowner=$1
                UNION ALL SELECT 1 FROM pg_database WHERE datdba=$1 LIMIT 1`, [existente.oid]);
            if (existente.rolsuper || existente.rolcreatedb || existente.rolcreaterole || existente.rolreplication || existente.rolbypassrls || relaciones.rowCount) {
                fallo('El rol existente tiene privilegios, membresías u objetos propios; requiere revisión manual.');
            }
        }
        const id = c.escapeIdentifier(rol), base = c.escapeIdentifier(actual.base), propietario = c.escapeIdentifier(actual.propietario);
        // Solo el verificador llega al SQL; la contraseña en claro nunca se registra ni se interpola.
        await c.query(`${existente ? 'ALTER' : 'CREATE'} ROLE ${id} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD ${c.escapeLiteral(verificador)}`);
        // Evita DDL/TEMP heredado de PUBLIC dentro de esta base dedicada a la aplicación.
        await c.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC; REVOKE CREATE, TEMPORARY ON DATABASE ${base} FROM PUBLIC;
            REVOKE ALL ON DATABASE ${base} FROM ${id}; GRANT CONNECT ON DATABASE ${base} TO ${id};
            REVOKE ALL ON SCHEMA public FROM ${id}; GRANT USAGE ON SCHEMA public TO ${id};
            REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${id};
            GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${id};
            REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${id};
            GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${id};
            ALTER DEFAULT PRIVILEGES FOR ROLE ${propietario} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${id};
            ALTER DEFAULT PRIVILEGES FOR ROLE ${propietario} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${id}`);
    });
    console.log('Rol de la API configurado con permisos de datos, sin DDL.');
}
module.exports = { concederApp };
