const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const jwt = require('jsonwebtoken');
const { spawnBackendProcess, startServer, api } = require('./helpers');

function waitForExit(proc, timeoutMs = 10000) {
  if (proc.exitCode !== null) {
    return Promise.resolve(proc.exitCode);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `El proceso no terminó en ${timeoutMs} ms.\nSTDOUT: ${proc.stdoutLog}\nSTDERR: ${proc.stderrLog}`
        )
      );
    }, timeoutMs);

    proc.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

describe('Pruebas de arranque y resiliencia del backend (A1 y P5)', () => {
  describe('A1 validación de JWT_SECRET al iniciar', () => {
    it('termina con código != 0 y mensaje claro en menos de 10 s si falta JWT_SECRET', async () => {
      const handle = spawnBackendProcess({
        port: 3102,
        omitJwtSecret: true,
        cwd: os.tmpdir(),
      });

      try {
        const exitCode = await waitForExit(handle.proc, 8000);
        assert.notEqual(
          exitCode,
          0,
          'El proceso debe terminar con código distinto de 0 cuando falta JWT_SECRET'
        );
        const combinedOutput = `${handle.proc.stdoutLog}\n${handle.proc.stderrLog}`;
        assert.match(combinedOutput, /JWT_SECRET/i);
      } finally {
        await handle.stop();
      }
    });

    it('termina con código != 0 y mensaje claro en menos de 10 s si JWT_SECRET está vacío', async () => {
      const handle = spawnBackendProcess({
        port: 3103,
        jwtSecret: '   ',
      });

      try {
        const exitCode = await waitForExit(handle.proc, 8000);
        assert.notEqual(
          exitCode,
          0,
          'El proceso debe terminar con código distinto de 0 cuando JWT_SECRET está vacío'
        );
        const combinedOutput = `${handle.proc.stdoutLog}\n${handle.proc.stderrLog}`;
        assert.match(combinedOutput, /JWT_SECRET/i);
      } finally {
        await handle.stop();
      }
    });
  });

  describe('P5 resiliencia ante base de datos caída', () => {
    it('responde 503 JSON en POST /api/papeletas cuando DB_PORT no tiene servidor y sigue vivo en GET /', async () => {
      const handle = await startServer({
        port: 3104,
        env: {
          DB_PORT: '55499',
        },
      });

      try {
        const client = api(handle.baseUrl);
        const token = jwt.sign(
          { idUsuario: 1, nombreUsuario: 'admin_prueba', rol: 'admin', ver: 0 },
          handle.jwtSecret,
          { expiresIn: '1h' }
        );

        const postRes = await client('POST', '/api/papeletas', {
          token,
          body: {
            id_tipo_formulario: 3,
            id_trabajador_origen: 1,
            id_trabajador_destino: 2,
            id_lugar_origen: 1,
            id_lugar_destino: 2,
            fecha: '2026-10-27',
            equipmentIds: [1],
          },
        });

        assert.equal(postRes.status, 503);
        assert.equal(typeof postRes.body, 'object');
        assert.equal(postRes.body.success, false);

        const healthRes = await client('GET', '/');
        assert.equal(healthRes.status, 200);
        assert.equal(handle.proc.exitCode, null);
      } finally {
        await handle.stop();
      }
    });
  });
});
