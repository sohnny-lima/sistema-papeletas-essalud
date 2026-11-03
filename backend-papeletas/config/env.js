// Configuración compartida por la API y el alta inicial de administrador.
const fs = require('node:fs');
const MIN_JWT_SECRET_LENGTH = 32;

function loadSecrets(env = process.env) {
    const errors = [];
    for (const nombre of ['DB_PASSWORD', 'JWT_SECRET']) {
        if (env[nombre + '_FILE']) {
            try {
                // Solo se retira el salto final habitual de un archivo secret.
                env[nombre] = fs.readFileSync(env[nombre + '_FILE'], 'utf8').replace(/\r?\n$/, '');
            } catch {
                errors.push(nombre + '_FILE no se puede leer. Compruebe el archivo y sus permisos.');
            }
        }
    }
    return errors;
}

function databaseErrors(env = process.env) {
    const errors = [];
    for (const nombre of ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER']) {
        if (!env[nombre]?.trim()) errors.push(nombre + ' es obligatorio.');
    }
    if (env.DB_PORT && (!/^\d+$/.test(env.DB_PORT) || Number(env.DB_PORT) < 1 || Number(env.DB_PORT) > 65535)) errors.push('DB_PORT debe ser un puerto válido.');
    if (env.NODE_ENV === 'production' && !env.DB_PASSWORD?.trim()) errors.push('DB_PASSWORD o DB_PASSWORD_FILE es obligatorio en producción.');
    return errors;
}

function databaseConfig(env = process.env) {
    const errors = [...loadSecrets(env), ...databaseErrors(env)];
    if (errors.length) throw new Error(errors.join(' '));
    return { host: env.DB_HOST, port: Number(env.DB_PORT), database: env.DB_NAME,
        user: env.DB_USER, password: env.DB_PASSWORD,
        connectionTimeoutMillis: Number(env.DB_CONNECTION_TIMEOUT_MS) || 10000 };
}

// Límites exclusivos del pool HTTP; los scripts y la sonda usan databaseConfig.
const LIMITES_API = {
    DB_STATEMENT_TIMEOUT_MS: ['statement_timeout', 15000],
    DB_QUERY_TIMEOUT_MS: ['query_timeout', 18000],
    DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: ['idle_in_transaction_session_timeout', 30000],
};
function apiDatabaseErrors(env = process.env) {
    const errors = [];
    for (const [nombre, [, defecto]] of Object.entries(LIMITES_API)) {
        const valor = String(env[nombre] ?? defecto);
        if (!/^[0-9]+$/.test(valor) || Number(valor) < 1 || Number(valor) > 2147483647) {
            errors.push(nombre + ' debe ser un entero entre 1 y 2147483647.');
        }
    }
    if (Number(env.DB_QUERY_TIMEOUT_MS ?? 18000) <= Number(env.DB_STATEMENT_TIMEOUT_MS ?? 15000)) {
        errors.push('DB_QUERY_TIMEOUT_MS debe ser mayor que DB_STATEMENT_TIMEOUT_MS.');
    }
    return errors;
}
function apiDatabaseConfig(env = process.env) {
    const errors = apiDatabaseErrors(env);
    if (errors.length) throw new Error(errors.join(' '));
    return { ...databaseConfig(env), ...Object.fromEntries(Object.entries(LIMITES_API)
        .map(([nombre, [opcion, defecto]]) => [opcion, Number(env[nombre] ?? defecto)])) };
}

function trustProxy(env = process.env) {
    const valor = (env.TRUST_PROXY || 'false').trim();
    if (valor === 'false' || valor === '0') return false;
    // Número de saltos, IP o subred explícitos; nunca confianza universal (true).
    if (/^[1-9]\d*$/.test(valor)) return Number(valor);
    if (valor === 'true') throw new Error('TRUST_PROXY debe indicar saltos, IP o subred; no se admite true.');
    return valor.split(',').map(v => v.trim());
}

function checkEnv(env = process.env) {
    const errors = [...loadSecrets(env), ...databaseErrors(env)];
    errors.push(...apiDatabaseErrors(env));
    if (!['true', 'false'].includes(env.ACCESS_LOG_ENABLED ?? 'true')) errors.push('ACCESS_LOG_ENABLED debe ser true o false.');
    const warnings = [];
    const secret = env.JWT_SECRET || '';
    if (secret !== secret.trim()) errors.push('JWT_SECRET no puede tener espacios, tabuladores ni saltos de línea en los extremos. El archivo admite un único salto final.');
    if (!secret) errors.push('JWT_SECRET o JWT_SECRET_FILE es obligatorio.');
    else if (secret.length < MIN_JWT_SECRET_LENGTH) {
        const mensaje = 'JWT_SECRET debe tener al menos 32 caracteres en producción.';
        (env.NODE_ENV === 'production' ? errors : warnings).push(mensaje);
    }
    for (const [nombre, defecto, min, max] of [
        ['DB_CONNECTION_TIMEOUT_MS', 10000, 1, 2147483647],
        ['LOGIN_RATE_LIMIT_MAX', 10, 1, 1000000],
        ['LOGIN_RATE_LIMIT_WINDOW_MS', 900000, 1, 2147483647],
        ['PASSWORD_MIN_LENGTH', 10, 10, 72],
    ]) {
        const valor = String(env[nombre] ?? defecto);
        if (!/^\d+$/.test(valor) || Number(valor) < min || Number(valor) > max) errors.push(nombre + ' debe ser un entero entre ' + min + ' y ' + max + '.');
    }
    // jsonwebtoken valida tanto el formato como una duración positiva.
    try {
        const jwt = require('jsonwebtoken');
        const token = jwt.sign({}, 'validacion-configuracion', { expiresIn: env.JWT_EXPIRES_IN || '1h' });
        const payload = jwt.decode(token);
        if (payload.exp <= payload.iat) throw new Error();
    } catch { errors.push('JWT_EXPIRES_IN debe ser una duración positiva (por ejemplo, 1h).'); }
    try {
        const proxy = trustProxy(env);
        if (Array.isArray(proxy)) require('proxy-addr').compile(proxy);
    } catch { errors.push('TRUST_PROXY debe ser false, un número de saltos, IP o subred válidos.'); }
    return { errors, warnings };
}
module.exports = {checkEnv, loadSecrets, databaseErrors, databaseConfig, apiDatabaseConfig, trustProxy, MIN_JWT_SECRET_LENGTH};
