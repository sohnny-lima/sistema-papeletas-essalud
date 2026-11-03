const { execFileSync, spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BACKEND_DIR = path.resolve(__dirname, '..');
const SQL_DIR = path.join(BACKEND_DIR, 'db');
const MIGRATIONS_DIR = path.join(SQL_DIR, 'migraciones');

const DEFAULT_PSQL = 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe';

const DB_CONFIG = {
  host: process.env.TEST_DB_HOST || 'localhost',
  port: Number(process.env.TEST_DB_PORT || 55432),
  database: process.env.TEST_DB_NAME || 'bd_papeleta_ci',
  user: process.env.TEST_DB_USER || 'postgres',
  password: process.env.TEST_DB_PASSWORD || 'no-se-usa',
};

// Las pruebas borran y recrean su base: nunca la de la revisión manual del responsable.
if (DB_CONFIG.database.trim().toLowerCase() === 'bd_papeleta_test') {
  throw new Error('TEST_DB_NAME no puede ser bd_papeleta_test (datos de la revisión manual).');
}
if (DB_CONFIG.database !== DB_CONFIG.database.trim() || !/^[a-z][a-z0-9_]{0,62}$/.test(DB_CONFIG.database)) {
  throw new Error('TEST_DB_NAME debe usar solo minúsculas, dígitos y guion bajo (1-63 caracteres).');
}

const USERS = {
  admin: { usuario: 'admin_prueba', clave: 'Admin.Prueba1' },
  user: { usuario: 'usuario_prueba', clave: 'Usuario.Prueba1' },
};

function getPsqlPath() {
  return process.env.PSQL || DEFAULT_PSQL;
}

function runPsql(args) {
  const psql = getPsqlPath();
  return execFileSync(
    psql,
    [
      '-h',
      DB_CONFIG.host,
      '-p',
      String(DB_CONFIG.port),
      '-U',
      DB_CONFIG.user,
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
      ...args,
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      // psql usa la misma contraseña que el backend (TEST_DB_PASSWORD), salvo que ya haya PGPASSWORD.
      env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || DB_CONFIG.password },
    }
  );
}

function getSqlFilesInOrder() {
  const schemaFile = path.join(SQL_DIR, 'esquema/001_esquema_inicial.sql');
  const seedFile = path.join(SQL_DIR, 'demo/datos-demo.sql');
  const migrationFiles = [];

  if (fs.existsSync(MIGRATIONS_DIR)) {
    const entries = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.toLowerCase().endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));
    for (const entry of entries) {
      migrationFiles.push(path.join(MIGRATIONS_DIR, entry));
    }
  }

  return [schemaFile, ...migrationFiles, seedFile];
}

function applySqlFiles(dbName = DB_CONFIG.database) {
  const files = getSqlFilesInOrder();
  for (const file of files) {
    runPsql(['-d', dbName, '-f', file]);
  }
}

/**
 * Recrea desde cero la base bd_papeleta_ci con DROP DATABASE IF EXISTS + CREATE DATABASE
 * y aplica db/esquema/001_esquema_inicial.sql, migraciones/*.sql y demo/datos-demo.sql.
 */
function recreateDatabase() {
  const dbName = DB_CONFIG.database;
  runPsql([
    '-d',
    'postgres',
    '-c',
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid();`,
  ]);
  runPsql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS "${dbName}";`]);
  runPsql(['-d', 'postgres', '-c', `CREATE DATABASE "${dbName}";`]);
  applySqlFiles(dbName);
}

/**
 * Reinicia el esquema public de bd_papeleta_ci y vuelve a cargar esquema, migraciones y datos
 * sin cerrar las conexiones activas del pool del proceso hijo (evita que pool.on('error')
 * dispare process.exit(-1) cuando el servidor ya está en marcha).
 */
function resetSchemaAndData() {
  const dbName = DB_CONFIG.database;
  runPsql([
    '-d',
    dbName,
    '-c',
    'DROP SCHEMA public CASCADE; CREATE SCHEMA public;',
  ]);
  applySqlFiles(dbName);
}

async function waitForServer(baseUrl, childProc, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    if (childProc.exitCode !== null) {
      throw new Error(
        `El servidor terminó prematuramente con código ${childProc.exitCode}.\nSTDOUT: ${childProc.stdoutLog}\nSTDERR: ${childProc.stderrLog}`
      );
    }

    try {
      const res = await fetch(`${baseUrl}/`);
      if (res.ok) {
        await res.text();
        return;
      }
    } catch (err) {
      lastError = err;
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(
    `Tiempo de espera agotado (${timeoutMs} ms) esperando GET ${baseUrl}/: ${
      lastError ? lastError.message : 'sin respuesta'
    }\nSTDOUT: ${childProc.stdoutLog}\nSTDERR: ${childProc.stderrLog}`
  );
}

function spawnBackendProcess(options = {}) {
  const port = options.port ?? 3100;
  const jwtSecret =
    options.jwtSecret !== undefined
      ? options.jwtSecret
      : crypto.randomBytes(32).toString('hex');

  const env = {
    ...process.env,
    PORT: String(port),
    CLIENT_URL: 'http://localhost:4200',
    NODE_ENV: 'test',
    AUDIT_ENABLED: 'false',
    // Las suites funcionales reutilizan una IP; el límite real se prueba en seguridad.test.js.
    LOGIN_RATE_LIMIT_MAX: '1000',
    DB_HOST: DB_CONFIG.host,
    DB_PORT: String(DB_CONFIG.port),
    DB_NAME: DB_CONFIG.database,
    DB_USER: DB_CONFIG.user,
    DB_PASSWORD: DB_CONFIG.password,
    JWT_SECRET: jwtSecret,
    ...(options.env || {}),
  };

  if (options.omitJwtSecret) {
    delete env.JWT_SECRET;
  }

  const proc = spawn(process.execPath, [path.join(BACKEND_DIR, 'index.js')], {
    cwd: options.cwd || BACKEND_DIR,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  proc.stdoutLog = '';
  proc.stderrLog = '';

  proc.stdout.setEncoding('utf8');
  proc.stderr.setEncoding('utf8');
  proc.stdout.on('data', (chunk) => {
    proc.stdoutLog += chunk;
  });
  proc.stderr.on('data', (chunk) => {
    proc.stderrLog += chunk;
  });

  const stop = async () => {
    if (proc.exitCode !== null) {
      return;
    }
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          // Ignorar si ya terminó
        }
        resolve();
      }, 3000);

      proc.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });

      try {
        proc.kill('SIGTERM');
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
  };

  return {
    proc,
    port,
    jwtSecret: env.JWT_SECRET,
    baseUrl: `http://localhost:${port}`,
    stop,
  };
}

async function startServer(options = {}) {
  const handle = spawnBackendProcess(options);
  try {
    await waitForServer(handle.baseUrl, handle.proc, options.timeoutMs ?? 10000);
    return handle;
  } catch (err) {
    await handle.stop();
    throw err;
  }
}

function api(baseUrl) {
  const normalizedBase = baseUrl.replace(/\/+$/, '');

  async function request(method, routePath, options = {}) {
    const { token, body, rawBody, headers: extraHeaders = {} } = options;
    const headers = { ...extraHeaders };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    let payload;
    if (rawBody !== undefined) {
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }
      payload = rawBody;
    } else if (body !== undefined) {
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }
      payload = JSON.stringify(body);
    }

    const url = routePath.startsWith('http')
      ? routePath
      : `${normalizedBase}${routePath.startsWith('/') ? '' : '/'}${routePath}`;

    const res = await fetch(url, {
      method,
      headers,
      body: payload,
    });

    const text = await res.text();
    let parsedBody;
    try {
      parsedBody = JSON.parse(text);
    } catch {
      parsedBody = text;
    }

    return {
      status: res.status,
      body: parsedBody,
      text,
      headers: res.headers,
    };
  }

  request.get = (routePath, options) => request('GET', routePath, options);
  request.post = (routePath, options) => request('POST', routePath, options);
  request.put = (routePath, options) => request('PUT', routePath, options);
  request.delete = (routePath, options) => request('DELETE', routePath, options);

  return request;
}

async function login(baseUrl, usuario, clave) {
  const client = api(baseUrl);
  const res = await client('POST', '/api/auth/login', {
    body: { nombreUsuario: usuario, contrasena: clave },
  });

  if (res.status !== 200 || !res.body || !res.body.token) {
    throw new Error(
      `Login falló para ${usuario}: status=${res.status}, body=${JSON.stringify(res.body)}`
    );
  }

  return res.body.token;
}

module.exports = {
  REPO_ROOT,
  BACKEND_DIR,
  DB_CONFIG,
  USERS,
  recreateDatabase,
  resetDatabase: recreateDatabase,
  resetSchemaAndData,
  runPsql,
  spawnBackendProcess,
  startServer,
  api,
  login,
};
