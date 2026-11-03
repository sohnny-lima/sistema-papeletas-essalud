// g011: operaciones reales exclusivamente sobre el esquema reconstruido del clúster de pruebas.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { Client } = require('pg');
const { REPO_ROOT, DB_CONFIG } = require('./helpers');
const windows = process.platform === 'win32';
const bin = process.env.PSQL ? path.dirname(process.env.PSQL) : (windows ? 'C:\\Program Files\\PostgreSQL\\17\\bin' : '');
const origen = 'bd_papeleta_tmp_g011_origen', destino = 'bd_papeleta_tmp_g011_destino';
const env = { ...process.env, DB_PASSWORD_FILE: '', PG_CONTAINER: '', PGHOST: DB_CONFIG.host, PGPORT: String(DB_CONFIG.port),
    PGUSER: DB_CONFIG.user, PGDATABASE: origen, PGPASSWORD: DB_CONFIG.password, PG_BIN: bin === '.' ? '' : bin };
let admin, dir;
function operacion(nombre, args, opciones = {}) {
    const archivo = path.join(REPO_ROOT, 'deploy/scripts', nombre + (windows ? '.ps1' : '.sh'));
    const r = spawnSync(windows ? 'pwsh.exe' : 'bash', windows ? ['-NoProfile', '-File', archivo, ...args] : [archivo, ...args],
        { cwd: REPO_ROOT, env: { ...env, ...opciones }, encoding: 'utf8', timeout: 30000 });
    assert.ifError(r.error); return r;
}
function argumentos(file, reemplazar = false) {
    const args = windows ? ['-Archivo', file, '-Destino', destino] : [file, destino];
    if (reemplazar) args.push(...(windows ? ['-Reemplazar', '-Confirmacion', 'REEMPLAZAR ' + destino] : ['--reemplazar', '--confirmacion', 'REEMPLAZAR ' + destino]));
    return args;
}
async function comprobarDestino() {
    const c = new Client({ ...DB_CONFIG, database: destino }); await c.connect();
    try { return (await c.query('SELECT valor FROM conservar')).rows; }
    finally { await c.end(); }
}
describe('g011 #3-#6 operación real sobre bases temporales (esquema reconstruido)', () => {
    before(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'papeletas-g011-'));
        admin = new Client({ ...DB_CONFIG, database: 'postgres' }); await admin.connect();
        await admin.query(`CREATE DATABASE "${origen}"`); await admin.query(`CREATE DATABASE "${destino}"`);
        const c = new Client({ ...DB_CONFIG, database: origen }); await c.connect();
        try { await c.query("CREATE TABLE conservar(valor text); INSERT INTO conservar VALUES ('copia_ficticia')"); } finally { await c.end(); }
        const d = new Client({ ...DB_CONFIG, database: destino }); await d.connect();
        try { await d.query("CREATE TABLE conservar(valor text); INSERT INTO conservar VALUES ('original_ficticio')"); } finally { await d.end(); }
    });
    after(async () => {
        if (admin) {
            // Solo estas bases y sus temporales, nunca otras bases del clúster.
            const { rows } = await admin.query('SELECT datname FROM pg_database WHERE datname=$1 OR datname=$2 OR starts_with(datname,$3) OR starts_with(datname,$4)', [origen, destino, destino + '_restaurando_', destino + '_anterior_']);
            try { for (const { datname } of rows) await admin.query('DROP DATABASE "' + datname.replaceAll('"', '""') + '"'); }
            finally { await admin.end(); }
        }
        if (dir) {
            const esperado = path.join(os.tmpdir(), 'papeletas-g011-');
            assert.ok(path.resolve(dir).startsWith(esperado));
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
    it('g011 #3 pg_restore con suma válida pero volcado corrupto conserva el destino y borra la temporal', async () => {
        const file = path.join(dir, 'corrupto.dump'); fs.writeFileSync(file, 'PGDMP-volcado-incompatible-ficticio');
        fs.writeFileSync(file + '.sha256', crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') + '\n');
        const r = operacion('restaurar', argumentos(file, true));
        assert.notEqual(r.status, 0); assert.match(r.stderr, /pg_restore/);
        assert.deepEqual(await comprobarDestino(), [{ valor: 'original_ficticio' }]);
        assert.equal((await admin.query('SELECT datname FROM pg_database WHERE starts_with(datname,$1)', [destino + '_restaurando_'])).rowCount, 0);
    });
    it('g011 #5 restaurar exige SHA y rechaza saltos internos aunque la suma restante sea correcta', async () => {
        const file = path.join(dir, 'sin-suma.dump'); fs.writeFileSync(file, 'datos_ficticios');
        let r = operacion('restaurar', argumentos(file, true)); assert.notEqual(r.status, 0); assert.match(r.stderr, /Falta el archivo de suma/);
        const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
        fs.writeFileSync(file + '.sha256', hash.slice(0, 32) + '\n' + hash.slice(32) + '\n');
        r = operacion('restaurar', argumentos(file, true)); assert.notEqual(r.status, 0); assert.match(r.stderr, /Suma SHA-256 incorrecta/);
        assert.deepEqual(await comprobarDestino(), [{ valor: 'original_ficticio' }]);
    });
    it('g011 #6 archivo secreto ilegible produce un mensaje fijo sin su ruta', () => {
        const secreto = path.join(dir, 'ruta-secreta-no-divulgar');
        const args = windows ? ['-Directorio', dir] : [dir];
        const r = operacion('respaldo', args, { DB_PASSWORD_FILE: secreto });
        assert.notEqual(r.status, 0); assert.match(r.stderr, /No se puede leer DB_PASSWORD_FILE/);
        assert.doesNotMatch(r.stderr, /ruta-secreta-no-divulgar/);
    });
    it('g011 #3+#5 copia completa, reemplazo confirmado y comparación real', async () => {
        const r = operacion('respaldo', windows ? ['-Directorio', dir] : [dir]); assert.equal(r.status, 0, r.stderr);
        const file = path.join(dir, fs.readdirSync(dir).find(n => n.startsWith('papeletas-') && n.endsWith('.dump')));
        for (const extension of ['', '.counts', '.sha256']) assert.ok(fs.statSync(file + extension).size > 0);
        // Una sesión activa debe impedir el intercambio y conservar el destino original.
        const conectado = new Client({ ...DB_CONFIG, database: destino }); await conectado.connect();
        try {
            const bloqueado = operacion('restaurar', argumentos(file, true)); assert.notEqual(bloqueado.status, 0);
            assert.deepEqual((await conectado.query('SELECT valor FROM conservar')).rows, [{ valor: 'original_ficticio' }]);
        } finally { await conectado.end(); }
        const restaurado = operacion('restaurar', argumentos(file, true)); assert.equal(restaurado.status, 0, restaurado.stderr);
        assert.deepEqual(await comprobarDestino(), [{ valor: 'copia_ficticia' }]);
        assert.equal((await admin.query('SELECT datname FROM pg_database WHERE starts_with(datname,$1) OR starts_with(datname,$2)', [destino + '_restaurando_', destino + '_anterior_'])).rowCount, 0);
    });
    it('g011 #4 nombres con mayúsculas y saltos finales se rechazan antes de operar', () => {
        for (const nombre of ['BD_INVALIDA', 'bd_invalida\n', 'bd_invalida;']) {
            const r = operacion('restaurar', windows ? ['-Archivo', 'irrelevante', '-Destino', nombre] : ['irrelevante', nombre]);
            assert.equal(r.status, 1); assert.match(r.stderr, /Nombre de base inválido/);
            if (windows) {
                const p = spawnSync('pwsh.exe', ['-NoProfile', '-File', path.join(REPO_ROOT, 'docs/revision/pruebas/preparar-bd-prueba.ps1'), '-DbName', nombre], { env, encoding: 'utf8', timeout: 10000 });
                assert.equal(p.status, 1); assert.match(p.stderr, /Nombre de base o puerto inválido/);
            }
        }
    });
    it('g011 #5/#6 errores de recuento y limpieza no dejan respaldos incompletos ni ocultan el fallo original', () => {
        const fixture = path.join(REPO_ROOT, 'backend-papeletas/test/fixtures/operacion-g011' + (windows ? '.ps1' : '.sh'));
        const simulacion = path.join(dir, 'simulacion'); fs.mkdirSync(simulacion);
        const args = windows ? ['-NoProfile', '-File', fixture, '-Directorio', simulacion] : [fixture, simulacion];
        const r = spawnSync(windows ? 'pwsh.exe' : 'bash', args, { env, encoding: 'utf8', timeout: 15000 });
        assert.ifError(r.error); assert.equal(r.status, 0, r.stderr + r.stdout);
    });
});
