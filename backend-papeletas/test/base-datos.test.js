const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync, execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { Client } = require('pg');
const { DB_CONFIG, BACKEND_DIR } = require('./helpers');
const { migraciones } = require('../scripts/migrar');
const { comparar, referencia } = require('../scripts/comparar-esquema');
const nombre = 'bd_papeleta_tmp_c004_unitarias';
const cfg = { ...DB_CONFIG, database: nombre };
const env = { ...process.env, NODE_ENV: 'test', DB_HOST: cfg.host, DB_PORT: String(cfg.port), DB_USER: cfg.user,
    DB_NAME: nombre, DB_PASSWORD: cfg.password, DB_PASSWORD_FILE: '', JWT_SECRET_FILE: '' };
const lista = migraciones();
let admin, c;
function script(nombreScript, args = [], input) {
    const r = spawnSync(process.execPath, ['scripts/' + nombreScript + '.js', ...args], { cwd: BACKEND_DIR, env, input, encoding: 'utf8', timeout: 15000 });
    assert.ifError(r.error); return r;
}
function ok(r) { assert.equal(r.status, 0, r.stderr + r.stdout); return r.stdout; }
function no(r, patron) { assert.notEqual(r.status, 0); assert.match(r.stderr, patron); }
function init() { ok(script('migrar', ['--inicializar'])); }
function migrar() { ok(script('migrar')); }
describe('c004 base de datos y operación (esquema reconstruido)', () => {
    before(async () => {
        admin = new Client({ ...DB_CONFIG, database: 'postgres' }); await admin.connect();
        await admin.query(`CREATE DATABASE ${nombre}`);
        c = new Client(cfg); await c.connect();
    });
    beforeEach(async () => { await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public'); });
    after(async () => { if (c) await c.end(); if (admin) { await admin.query(`DROP DATABASE IF EXISTS ${nombre}`); await admin.end(); } });
    it('estado no crea tablas ni registros', async () => {
        assert.match(ok(script('migrar', ['--estado'])), /Pendiente/);
        assert.equal((await c.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n, 0);
    });
    it('inicializa sin usuarios ni demo', async () => {
        init(); assert.equal((await c.query('SELECT count(*)::int n FROM usuarios')).rows[0].n, 0);
        assert.equal((await c.query('SELECT count(*)::int n FROM papeletas')).rows[0].n, 0);
    });
    it('rechaza inicialización con una tabla de aplicación existente', async () => {
        await c.query('CREATE TABLE usuarios(id int)');
        no(script('migrar', ['--inicializar']), /ya existen tablas/);
        assert.equal((await c.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'")).rows[0].n, 1);
    });
    it('rechaza inicialización con tablas de aplicación en otro esquema', async () => {
        await c.query('CREATE SCHEMA anterior; CREATE TABLE anterior.usuarios(id int)');
        try { no(script('migrar', ['--inicializar']), /ya existen tablas/); }
        finally { await c.query('DROP SCHEMA anterior CASCADE'); }
        assert.equal((await c.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'")).rows[0].n, 0);
    });
    it('aplica todas las migraciones y registra suma, fecha y versión', async () => {
        init(); migrar(); const { rows } = await c.query('SELECT * FROM esquema_migraciones ORDER BY nombre');
        assert.equal(rows.length, lista.length); assert.equal(rows[0].suma_sha256, lista[0].suma);
        assert.ok(rows[0].fecha_aplicacion instanceof Date); assert.equal(rows[0].version_aplicacion, require('../package.json').version);
        assert.match(ok(script('migrar', ['--estado'])), /Aplicada/);
    });
    it('idempotencia conserva la fecha y los registros de todas las migraciones', async () => {
        init(); migrar(); const antes = (await c.query('SELECT * FROM esquema_migraciones ORDER BY nombre')).rows;
        migrar(); assert.deepEqual((await c.query('SELECT * FROM esquema_migraciones ORDER BY nombre')).rows, antes);
    });
    it('suma alterada bloquea aplicar y estado', async () => {
        init(); migrar(); await c.query("UPDATE esquema_migraciones SET suma_sha256=repeat('0',64) WHERE nombre=$1", [lista[0].nombre]);
        no(script('migrar'), /Suma alterada/); no(script('migrar', ['--estado']), /Suma alterada/);
    });
    it('la suma no depende de los finales de línea (Windows CRLF frente a Linux/Docker LF)', () => {
        const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'c004-eol-'));
        try {
            const lf = path.join(tmp, 'lf'), crlf = path.join(tmp, 'crlf');
            fs.mkdirSync(lf); fs.mkdirSync(crlf);
            const texto = '-- prueba\nSELECT 1;\nSELECT 2;\n';
            fs.writeFileSync(path.join(lf, '001_prueba.sql'), texto);
            fs.writeFileSync(path.join(crlf, '001_prueba.sql'), texto.replace(/\n/g, '\r\n'));
            assert.equal(migraciones(lf)[0].suma, migraciones(crlf)[0].suma);
            fs.writeFileSync(path.join(crlf, '001_prueba.sql'), texto.replace('SELECT 2', 'SELECT 3'));
            assert.notEqual(migraciones(lf)[0].suma, migraciones(crlf)[0].suma);
        } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    });
    it('bloqueo consultivo impide otra operación', async () => {
        await c.query('SELECT pg_advisory_lock(704004,1)');
        try { no(script('migrar', ['--inicializar']), /otra operación/); }
        finally { await c.query('SELECT pg_advisory_unlock(704004,1)'); }
    });
    it('duplicados revierten el índice y el registro sin revelar detail', async () => {
        init(); await c.query("INSERT INTO papeletas(numero_papeleta,fecha) VALUES ('PA-0001',CURRENT_DATE),('PA-0001',CURRENT_DATE)");
        const r = script('migrar'); no(r, /Operación de base de datos fallida/); assert.doesNotMatch(r.stderr, /PA-0001|duplicados|DETAIL/);
        assert.equal((await c.query('SELECT count(*)::int n FROM esquema_migraciones')).rows[0].n, 0);
        assert.equal((await c.query("SELECT to_regclass('ux_papeletas_numero_papeleta') i")).rows[0].i, null);
    });
    it('registrar-existentes comprueba y registra índices sin reaplicar', async () => {
        init(); for (const m of lista) await c.query(m.sql);
        ok(script('migrar', ['--registrar-existentes', lista.map(m => m.nombre).join(',')]));
        assert.equal((await c.query('SELECT count(*)::int n FROM esquema_migraciones')).rows[0].n, lista.length);
        migrar();
    });
    it('registrar-existentes rechaza índice inexistente', async () => {
        init(); no(script('migrar', ['--registrar-existentes', lista[0].nombre]), /índice esperado/);
        assert.equal((await c.query('SELECT count(*)::int n FROM esquema_migraciones')).rows[0].n, 0);
    });
    it('registrar-existentes rechaza índice de otra columna', async () => {
        init(); await c.query('CREATE UNIQUE INDEX ux_papeletas_numero_papeleta ON papeletas(id_papeleta)');
        no(script('migrar', ['--registrar-existentes', lista[0].nombre]), /otra definición/);
    });
    it('registrar-existentes rechaza nombres desconocidos', () => {
        no(script('migrar', ['--registrar-existentes', '999_desconocida.sql']), /desconocida/);
    });
    it('demo se niega sin confirmación y no crea datos', async () => {
        init(); no(script('cargar-demo'), /confirmar-demo/);
        assert.equal((await c.query('SELECT count(*)::int n FROM usuarios')).rows[0].n, 0);
    });
    it('demo explícita carga datos ficticios y rechaza repetición con papeletas', async () => {
        init(); migrar(); ok(script('cargar-demo', ['--confirmar-demo']));
        assert.equal((await c.query('SELECT count(*)::int n FROM usuarios')).rows[0].n, 2);
        no(script('cargar-demo', ['--confirmar-demo']), /base debe estar vacía/);
    });
    it('demo rechaza usuarios no ficticios aunque no haya papeletas', async () => {
        init(); await c.query("INSERT INTO roles VALUES (1,'ADMINISTRADOR'); INSERT INTO usuarios VALUES (1,'operador_real','hash_ficticio',1)");
        no(script('cargar-demo', ['--confirmar-demo']), /base debe estar vacía/);
    });
    it('instalación nueva, catálogos y primer administrador por stdin', async () => {
        init(); migrar(); ok(script('migrar', ['--catalogos-iniciales']));
        ok(script('crear-admin', ['admin_instalacion'], 'Clave.Ficticia2026\n'));
        assert.deepEqual((await c.query('SELECT nombre_usuario,id_rol FROM usuarios')).rows, [{ nombre_usuario: 'admin_instalacion', id_rol: 1 }]);
        assert.equal((await c.query('SELECT count(*)::int n FROM papeletas')).rows[0].n, 0);
        no(script('migrar', ['--catalogos-iniciales']), /instalación debe estar vacía/);
    });
    it('comparador acepta pg_dump del esquema reconstruido con migraciones', async () => {
        init(); migrar();
        const exe = process.env.PSQL ? path.join(path.dirname(process.env.PSQL), process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump') : (process.platform === 'win32' ? 'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe' : 'pg_dump');
        const dump = execFileSync(exe, ['-h', cfg.host, '-p', String(cfg.port), '-U', cfg.user, '-d', nombre, '--schema-only', '--no-owner', '--no-privileges'], { env: { ...process.env, PGPASSWORD: cfg.password }, encoding: 'utf8' });
        assert.match(dump, /ALTER TABLE ONLY public\.\w+ ALTER COLUMN \w+ SET DEFAULT nextval\(/);
        assert.deepEqual(comparar(dump, referencia()), []);
    });
    it('g011 #1 helpers rechaza nombres protegidos, mayúsculas, espacios e inyección sin conectar', () => {
        for (const nombreInvalido of ['BD_PAPELETA_TEST', ' bd_papeleta_test', 'bd_papeleta_test ', 'BD_PAPELETA_TEST\n', 'bd_papeleta_test\n', 'bd_papeleta_ci\n', 'bd_papeleta_ci"', 'bd_papeleta_ci;DROP DATABASE postgres']) {
            const r = spawnSync(process.execPath, ['-e', "require('./test/helpers')"], { cwd: BACKEND_DIR, env: { ...process.env, TEST_DB_NAME: nombreInvalido }, encoding: 'utf8' });
            assert.equal(r.status, 1, nombreInvalido);
            assert.match(r.stderr, /TEST_DB_NAME/);
        }
    });
    it('g011 #2 serial frente a PK sin generación detecta una diferencia que afecta a las altas', () => {
        const ref = referencia();
        const modificado = ref.replace('SERIAL PRIMARY KEY', 'INTEGER NOT NULL PRIMARY KEY');
        assert.match(comparar(modificado, ref).join('\n'), /roles.id_rol: autogeneración distinta/);
    });
    it('g011 #2 índice parcial no equivale a un índice total', () => {
        const ref = referencia();
        const parcial = ref.replace('ON papeletas (numero_papeleta);', 'ON papeletas (numero_papeleta) WHERE numero_papeleta IS NOT NULL;');
        const dif = comparar(parcial, ref).join('\n');
        assert.match(dif, /falta indices unique:numero_papeleta/);
        assert.match(dif, /where numero_papeleta is not null/);
    });
    it('g011 #2 identificadores entre comillas en tablas, columnas, claves e índices', () => {
        const ref = referencia();
        const quoted = ref.replace(/CREATE TABLE (\w+)/g, 'CREATE TABLE "public"."$1"')
            .replace('    id_rol      SERIAL', '    "id_rol"    SERIAL')
            .replace('REFERENCES roles(id_rol)', 'REFERENCES "public"."roles"("id_rol")')
            .replace('id_usuario      SERIAL PRIMARY KEY', 'id_usuario      SERIAL')
            .replace('CREATE UNIQUE INDEX IF NOT EXISTS ux_papeletas_numero_papeleta\n    ON papeletas (numero_papeleta);', 'CREATE UNIQUE INDEX "ux_papeletas_numero_papeleta" ON "public"."papeletas" ("numero_papeleta");')
            + '\nALTER TABLE ONLY "public"."usuarios" ADD CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id_usuario");';
        assert.deepEqual(comparar(quoted, ref), []);
    });
    it('g011 #2 ALTER COLUMN SET DEFAULT y SET NOT NULL reconoce la secuencia de pg_dump', () => {
        const ref = referencia();
        const dump = ref.replace('SERIAL PRIMARY KEY', 'INTEGER') + `
ALTER TABLE ONLY "public"."roles" ALTER COLUMN "id_rol" SET DEFAULT nextval('public.roles_id_rol_seq'::regclass);
ALTER TABLE "public"."roles" ALTER COLUMN "id_rol" SET NOT NULL;
ALTER TABLE ONLY "public"."roles" ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id_rol");`;
        assert.deepEqual(comparar(dump, ref), []);
        assert.match(comparar(dump.replace("nextval('public.roles_id_rol_seq'::regclass)", '0'), ref).join('\n'), /autogeneración distinta/);
    });
    it('g011 #2 GENERATED AS IDENTITY inline y ALTER TABLE equivalen a una columna autogenerada', () => {
        const ref = referencia();
        assert.deepEqual(comparar(ref.replace('SERIAL PRIMARY KEY', 'INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY'), ref), []);
        const alter = ref.replace('SERIAL PRIMARY KEY', 'INTEGER NOT NULL PRIMARY KEY') + '\nALTER TABLE ONLY "public"."roles" ALTER COLUMN "id_rol" ADD GENERATED BY DEFAULT AS IDENTITY (SEQUENCE NAME public.roles_id_rol_seq);';
        assert.deepEqual(comparar(alter, ref), []);
    });
    it('comparador detecta columnas, tipo, nulos, claves e índices únicos alterados', () => {
        const ref = referencia();
        const alterado = ref.replace('motivo                 TEXT', 'otro_motivo            TEXT')
            .replace('fecha                  DATE NOT NULL', 'fecha                  TIMESTAMP')
            .replace('SERIAL PRIMARY KEY', 'INTEGER NOT NULL')
            .replace('CREATE UNIQUE INDEX IF NOT EXISTS ux_papeletas_numero_papeleta', 'CREATE INDEX IF NOT EXISTS ux_papeletas_numero_papeleta');
        const dif = comparar(alterado, ref).join('\n');
        assert.match(dif, /motivo: columna ausente/); assert.match(dif, /fecha: tipo o nulabilidad/);
        assert.match(dif, /primary key/); assert.match(dif, /unique:numero_papeleta/);
    });
    it('comparador detecta tabla ausente sin ejecutar SQL', () => {
        const dif = comparar('DROP DATABASE postgres;', referencia()); assert.equal(dif.length, 10);
    });
});
