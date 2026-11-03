const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync, execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Client } = require('pg');
const jwt = require('jsonwebtoken');
const { migraciones } = require('../scripts/migrar');
const { comparar, referencia } = require('../scripts/comparar-esquema');
const { DB_CONFIG, BACKEND_DIR, recreateDatabase, resetSchemaAndData, startServer, api, login, USERS } = require('./helpers');
const CLAVE = 'Clave.Ficticia2026';
const ULTIMO = 'Debe quedar al menos un administrador activo.';
const PROPIA = 'No puede cambiar su propio rol ni desactivar su propia cuenta.';
const DUPLICADO = 'Ya existe un usuario con ese nombre.';
const INVALIDA = 'Su sesión ya no es válida. Inicie sesión de nuevo.';
const lista = migraciones();
const m003 = lista.find(m => m.nombre.startsWith('003_'));
const envBD = database => ({ ...process.env, NODE_ENV: 'test', DB_HOST: DB_CONFIG.host,
    DB_PORT: String(DB_CONFIG.port), DB_USER: DB_CONFIG.user, DB_NAME: database,
    DB_PASSWORD: DB_CONFIG.password, DB_PASSWORD_FILE: '', JWT_SECRET_FILE: '', PASSWORD_MIN_LENGTH: '10' });
function script(database, nombre, args = [], input) {
    const r = spawnSync(process.execPath, [`scripts/${nombre}.js`, ...args], { cwd: BACKEND_DIR, env: envBD(database), input, encoding: 'utf8', timeout: 15000 });
    assert.ifError(r.error); return r;
}
function ok(r) { assert.equal(r.status, 0, r.stderr + r.stdout); return r.stdout; }
function sinSecretos(r) { assert.doesNotMatch(r.text, /contrasena|\$2[aby]\$|version_sesion/); }

describe('U1 B-01/B-02 migración y administrador (base temporal, esquema reconstruido)', () => {
    const nombre = `bd_papeleta_tmp_c008_${process.pid}`;
    let admin, c;
    before(async () => {
        admin = new Client({ ...DB_CONFIG, database: 'postgres' }); await admin.connect();
        await admin.query(`CREATE DATABASE ${nombre}`);
        c = new Client({ ...DB_CONFIG, database: nombre }); await c.connect();
    });
    beforeEach(async () => {
        await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
        ok(script(nombre, 'migrar', ['--inicializar']));
        for (const m of lista.filter(m => m !== m003)) await c.query(m.sql);
        ok(script(nombre, 'migrar', ['--registrar-existentes', lista.filter(m => m !== m003).map(m => m.nombre).join(',')]));
        ok(script(nombre, 'cargar-demo', ['--confirmar-demo']));
    });
    after(async () => {
        if (c) await c.end();
        if (admin) { try { await admin.query(`DROP DATABASE IF EXISTS ${nombre}`); } finally { await admin.end(); } }
    });
    it('B-01 aplica sobre demo, conserva hashes, es idempotente, pg_dump/comparador da 0 diferencias y revierte', async t => {
        const antes = (await c.query('SELECT id_usuario, contrasena FROM usuarios ORDER BY id_usuario')).rows;
        assert.match(ok(script(nombre, 'migrar')), /Aplicada: 003/);
        const usuarios = (await c.query('SELECT activo, version_sesion, fecha_creacion FROM usuarios')).rows;
        assert.equal(usuarios.length, 2);
        for (const u of usuarios) { assert.equal(u.activo, true); assert.equal(u.version_sesion, 0); assert.ok(u.fecha_creacion instanceof Date); }
        const despues = (await c.query('SELECT id_usuario, contrasena FROM usuarios ORDER BY id_usuario')).rows;
        assert.ok(JSON.stringify(antes) === JSON.stringify(despues), 'Los hashes existentes deben conservarse');
        const registro = (await c.query('SELECT * FROM esquema_migraciones ORDER BY nombre')).rows;
        assert.match(ok(script(nombre, 'migrar')), /Ya aplicada: 003/);
        await c.query(m003.sql);
        assert.deepEqual((await c.query('SELECT * FROM esquema_migraciones ORDER BY nombre')).rows, registro);
        const exe = process.env.PSQL ? path.join(path.dirname(process.env.PSQL), process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump') : 'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe';
        const dump = execFileSync(exe, ['-h', DB_CONFIG.host, '-p', String(DB_CONFIG.port), '-U', DB_CONFIG.user, '-d', nombre, '--schema-only', '--no-owner', '--no-privileges'], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: DB_CONFIG.password } });
        assert.deepEqual(comparar(dump, referencia()), []);
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c008-dump-'));
        try {
            const archivo = path.join(dir, 'esquema.sql'); fs.writeFileSync(archivo, dump);
            const salida = ok(script(nombre, 'comparar-esquema', [archivo]));
            assert.match(salida, /Sin diferencias estructurales/); t.diagnostic(salida.trim());
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
        // Ejecuta la reversión exactamente como se documenta en el propio archivo.
        const reversa = m003.sql.split(/\r?\n/).filter(l => /^-- (BEGIN;|DROP INDEX|ALTER TABLE|DELETE FROM|COMMIT;)/.test(l)).map(l => l.slice(3)).join('\n');
        await c.query(reversa);
        assert.equal((await c.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='usuarios' AND column_name IN ('activo','version_sesion','fecha_creacion')")).rows[0].n, 0);
        assert.equal((await c.query("SELECT to_regclass('ux_usuarios_nombre_lower') i")).rows[0].i, null);
        assert.ok(JSON.stringify((await c.query('SELECT id_usuario, contrasena FROM usuarios ORDER BY id_usuario')).rows) === JSON.stringify(antes));
        ok(script(nombre, 'migrar'));
    });
    it('B-01 duplicados lower detienen migrar.js y muestran nombres/ids sin hashes; rollback íntegro', async () => {
        await c.query("INSERT INTO usuarios(nombre_usuario, contrasena, id_rol) SELECT 'Admin_Prueba', contrasena, id_rol FROM usuarios WHERE id_usuario=1");
        const r = script(nombre, 'migrar'); assert.equal(r.status, 1);
        assert.match(r.stderr, /U1 migración 003:.*admin_prueba \(ids: 1, 3\)/);
        assert.doesNotMatch(r.stderr, /\$2[aby]\$|DETAIL|contrasena/);
        assert.equal((await c.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='usuarios' AND column_name='activo'")).rows[0].n, 0);
        assert.equal((await c.query('SELECT count(*)::int n FROM esquema_migraciones')).rows[0].n, lista.length - 1);
    });
    it('B-01 adopción verifica tipo, nulabilidad y DEFAULT de las tres columnas; comparador detecta DEFAULT alterado', async () => {
        await c.query(m003.sql);
        const alteraciones = [
            ['activo', 'TYPE text USING activo::text', "TYPE boolean USING activo::boolean", 'true', "'true'::text"],
            ['version_sesion', 'TYPE bigint', 'TYPE integer', '0', '0'],
            ['fecha_creacion', 'TYPE timestamp without time zone', 'TYPE timestamptz', 'now()', 'now()'],
        ];
        for (const [col, cambio, restaurar, defecto, alterno] of alteraciones) {
            await c.query(`ALTER TABLE usuarios ALTER COLUMN ${col} DROP NOT NULL`);
            let r = script(nombre, 'migrar', ['--registrar-existentes', m003.nombre]); assert.equal(r.status, 1); assert.match(r.stderr, /columna esperada/);
            await c.query(`ALTER TABLE usuarios ALTER COLUMN ${col} SET NOT NULL; ALTER TABLE usuarios ALTER COLUMN ${col} DROP DEFAULT`);
            r = script(nombre, 'migrar', ['--registrar-existentes', m003.nombre]); assert.equal(r.status, 1);
            await c.query(`ALTER TABLE usuarios ALTER COLUMN ${col} ${cambio}; ALTER TABLE usuarios ALTER COLUMN ${col} SET DEFAULT ${alterno}`);
            r = script(nombre, 'migrar', ['--registrar-existentes', m003.nombre]); assert.equal(r.status, 1);
            await c.query(`ALTER TABLE usuarios ALTER COLUMN ${col} DROP DEFAULT; ALTER TABLE usuarios ALTER COLUMN ${col} ${restaurar}; ALTER TABLE usuarios ALTER COLUMN ${col} SET DEFAULT ${defecto}`);
        }
        const ref = referencia();
        assert.match(comparar(ref.replace('DEFAULT true', 'DEFAULT false'), ref).join('\n'), /activo: valor DEFAULT distinto/);
        assert.match(comparar(ref.replace('DEFAULT 0', 'DEFAULT 1'), ref).join('\n'), /version_sesion: valor DEFAULT distinto/);
        assert.match(comparar(ref.replace('DEFAULT now()', "DEFAULT '2020-01-01'::timestamptz"), ref).join('\n'), /fecha_creacion: valor DEFAULT distinto/);
        ok(script(nombre, 'migrar', ['--registrar-existentes', m003.nombre]));
        assert.equal((await c.query('SELECT count(*)::int n FROM esquema_migraciones')).rows[0].n, lista.length);
    });
    it('B-02 crear-admin crea cuenta activa/ver 0 y rechaza duplicado con otra caja', async () => {
        ok(script(nombre, 'migrar'));
        ok(script(nombre, 'crear-admin', ['Admin_C008'], CLAVE + '\n'));
        assert.deepEqual((await c.query("SELECT activo, version_sesion, id_rol FROM usuarios WHERE nombre_usuario='Admin_C008'")).rows, [{ activo: true, version_sesion: 0, id_rol: 1 }]);
        const r = script(nombre, 'crear-admin', ['ADMIN_C008'], CLAVE + '\n');
        assert.equal(r.status, 1); assert.match(r.stderr, /ya existe/); assert.ok(!r.stderr.includes(CLAVE));
        assert.equal((await c.query('SELECT count(*)::int n FROM usuarios')).rows[0].n, 3);
    });
});

describe('U2 B-03…B-13 API y sesiones (esquema reconstruido)', () => {
    let server, client, c, admin, user;
    before(async () => {
        recreateDatabase();
        c = new Client(DB_CONFIG); await c.connect();
        server = await startServer({ port: 3109, env: { AUDIT_ENABLED: 'true', PASSWORD_MIN_LENGTH: '12' } });
        client = api(server.baseUrl);
    });
    beforeEach(async () => {
        resetSchemaAndData();
        admin = await login(server.baseUrl, USERS.admin.usuario, USERS.admin.clave);
        user = await login(server.baseUrl, USERS.user.usuario, USERS.user.clave);
    });
    after(async () => { if (server) await server.stop(); if (c) await c.end(); });
    const estado = (id, activo, token) => client('PATCH', `/api/usuarios/${id}/estado`, { token, body: { activo } });
    const editar = (id, body, token) => client.put(`/api/usuarios/${id}`, { token, body });
    async function crear(nombre, rol = 2) {
        const r = await client.post('/api/usuarios', { token: admin, body: { nombre_usuario: nombre, id_rol: rol, contrasena: CLAVE } });
        assert.equal(r.status, 200, r.text); sinSecretos(r); return r.body.data;
    }
    async function version(id) { return (await c.query('SELECT version_sesion FROM usuarios WHERE id_usuario=$1', [id])).rows[0].version_sesion; }
    async function invalida(token) {
        for (const ruta of ['/api/auth/sesion', '/api/papeletas']) {
            const r = await client.get(ruta, { token }); assert.equal(r.status, 401); assert.equal(r.body.message, INVALIDA);
        }
    }
    it('B-03 login sin distinguir mayúsculas, JWT ver, 403 solo con clave correcta y 401 genérico', async () => {
        const token = await login(server.baseUrl, 'ADMIN_PRUEBA', USERS.admin.clave);
        assert.equal(jwt.verify(token, server.jwtSecret).ver, 0);
        assert.equal((await estado(2, false, admin)).status, 200);
        const r = await client.post('/api/auth/login', { body: { nombreUsuario: 'USUARIO_PRUEBA', contrasena: USERS.user.clave } });
        assert.equal(r.status, 403); assert.equal(r.body.message, 'La cuenta está desactivada. Contacte con un administrador.');
        const err = await client.post('/api/auth/login', { body: { nombreUsuario: 'usuario_prueba', contrasena: 'Incorrecta1' } });
        const ausente = await client.post('/api/auth/login', { body: { nombreUsuario: 'ausente', contrasena: 'Incorrecta1' } });
        assert.equal(err.status, 401); assert.deepEqual(err.body, ausente.body); sinSecretos(r); sinSecretos(err);
    });
    it('B-04 sesión envuelta, etiquetas fijas y 401 sin token, sin ver entero o sin cuenta', async () => {
        for (const [token, idUsuario, nombreUsuario, rol, rolNombre] of [[admin, 1, 'admin_prueba', 'admin', 'Administrador'], [user, 2, 'usuario_prueba', 'user', 'Usuario']]) {
            const r = await client.get('/api/auth/sesion', { token }); assert.equal(r.status, 200);
            assert.equal(r.body.success, true); assert.deepEqual(r.body.data, { idUsuario, nombreUsuario, rol, rolNombre });
        }
        assert.equal((await client.get('/api/auth/sesion')).status, 401);
        for (const ver of [undefined, null, '0', 0.5]) await invalida(jwt.sign({ idUsuario: 1, rol: 'admin', ver }, server.jwtSecret));
        await invalida(jwt.sign({ idUsuario: 2147483647, ver: 0 }, server.jwtSecret));
    });
    it('B-05 rol/clave/estado invalidan, reactivar no resucita tokens y PATCH sin cambio conserva versión', async () => {
        assert.equal((await editar(2, { nombre_usuario: 'usuario_prueba', id_rol: 1 }, admin)).status, 200);
        assert.equal(await version(2), 1); await invalida(user);
        let token = await login(server.baseUrl, USERS.user.usuario, USERS.user.clave);
        assert.equal((await editar(2, { nombre_usuario: 'usuario_prueba', id_rol: 1, contrasena: CLAVE }, admin)).status, 200);
        assert.equal(await version(2), 2); await invalida(token);
        token = await login(server.baseUrl, USERS.user.usuario, CLAVE);
        assert.equal((await estado(2, false, admin)).status, 200); assert.equal(await version(2), 3); await invalida(token);
        assert.equal((await estado(2, false, admin)).status, 200); assert.equal(await version(2), 3);
        assert.equal((await estado(2, true, admin)).status, 200); assert.equal(await version(2), 4); await invalida(token);
        token = await login(server.baseUrl, USERS.user.usuario, CLAVE);
        assert.equal((await estado(2, true, admin)).status, 200); assert.equal(await version(2), 4);
        assert.equal((await client.get('/api/auth/sesion', { token })).status, 200);
    });
    it('B-06 renombrar no invalida y PUT con clave ausente/null/vacía no cambia la versión', async () => {
        for (const contrasena of [undefined, null, '']) {
            const r = await editar(1, { nombre_usuario: 'Admin_Renombrado', id_rol: 1, contrasena }, admin);
            assert.equal(r.status, 200); sinSecretos(r); assert.equal(await version(1), 0);
        }
        const r = await client.get('/api/auth/sesion', { token: admin }); assert.equal(r.status, 200); assert.equal(r.body.data.nombreUsuario, 'Admin_Renombrado');
    });
    it('B-07 rol desde BD prevalece sobre JWT y verifyAdmin precede a id en todos los métodos', async () => {
        const falsoAdmin = jwt.sign({ idUsuario: 2, ver: 0, rol: 'admin' }, server.jwtSecret);
        for (const token of [user, falsoAdmin]) {
            for (const [metodo, ruta] of [['GET', ''], ['POST', ''], ['GET', '/politica-contrasena'], ['GET', '/abc'], ['PUT', '/abc'], ['DELETE', '/abc'], ['PATCH', '/abc/estado'], ['GET', '/1'], ['PUT', '/1'], ['DELETE', '/1'], ['PATCH', '/1/estado']]) {
                assert.equal((await client(metodo, '/api/usuarios' + ruta, { token, body: ['POST', 'PUT', 'PATCH'].includes(metodo) ? {} : undefined })).status, 403);
            }
        }
        for (const metodo of ['GET', 'PUT', 'DELETE', 'PATCH']) {
            assert.equal((await client(metodo, '/api/usuarios/abc' + (metodo === 'PATCH' ? '/estado' : ''), { token: admin, body: metodo === 'GET' ? undefined : {} })).status, 400);
            assert.equal((await client(metodo, '/api/usuarios/99999' + (metodo === 'PATCH' ? '/estado' : ''), { token: admin, body: metodo === 'GET' ? undefined : { nombre_usuario: 'valido', id_rol: 2, activo: false } })).status, 404);
        }
        await c.query('UPDATE usuarios SET id_rol=2 WHERE id_usuario=1');
        assert.equal((await client.get('/api/usuarios', { token: admin })).status, 403);
    });
    it('B-08 lista paginada/buscada/filtrada, orden lower, ISO y sin hashes en respuestas ni auditoría', async () => {
        for (let i = 0; i < 12; i++) await crear(`Lote_${String(i).padStart(2, '0')}`);
        await estado(3, false, admin);
        const r = await client.get('/api/usuarios?search=LOTE&estado=activos&page=2&pageSize=10', { token: admin });
        assert.equal(r.status, 200); sinSecretos(r);
        assert.deepEqual({ ...r.body.data, data: [] }, { data: [], totalItems: 11, totalPages: 2, currentPage: 2 });
        assert.equal(r.body.data.data.length, 1); assert.equal(r.body.data.data[0].nombre_usuario, 'Lote_11');
        assert.match(r.body.data.data[0].fecha_creacion, /^\d{4}-\d\d-\d\dT.*Z$/);
        const primera = await client.get('/api/usuarios?search=lOtE&estado=todos', { token: admin });
        assert.equal(primera.body.data.data.length, 10); assert.equal(primera.body.data.data[0].nombre_usuario, 'Lote_00');
        const inactivas = await client.get('/api/usuarios?estado=inactivos', { token: admin }); assert.equal(inactivas.body.data.totalItems, 1);
        assert.equal((await client.get('/api/usuarios?estado=invalido', { token: admin })).status, 400);
        const detalle = await client.get('/api/usuarios/3', { token: admin }); sinSecretos(detalle);
        assert.deepEqual(Object.keys(detalle.body.data).sort(), ['id_usuario', 'nombre_usuario', 'id_rol', 'activo', 'fecha_creacion', 'rol', 'rolNombre'].sort());
        // VM1 registra también GET /politica-contrasena: el nombre público de la ruta
        // es válido; siguen prohibidos el campo de contraseña, sus valores y hashes.
        const logs = server.proc.stdoutLog + server.proc.stderrLog;
        assert.doesNotMatch(logs, /"contrasena"\s*:|\$2[aby]\$|Clave.Ficticia2026/);
        for (const clave of [CLAVE, USERS.admin.clave, USERS.user.clave]) assert.ok(!logs.includes(clave));
    });
    it('c009-2 B-08 búsqueda literal de guion bajo, porcentaje y barra inversa', async () => {
        const sufijo = crypto.randomBytes(4).toString('hex');
        const literal = await crear('j_perez_' + sufijo);
        const parecido = await crear('jxperez_' + sufijo);
        const buscar = search => client.get('/api/usuarios?search=' + encodeURIComponent(search), { token: admin });
        let r = await buscar('j_perez');
        assert.equal(r.status, 200);
        assert.deepEqual(r.body.data.data.map(u => u.id_usuario), [literal.id_usuario]);
        r = await buscar('%'); assert.equal(r.status, 200); assert.equal(r.body.data.totalItems, 0);
        // El formato histórico puede contener caracteres que el alta nueva rechaza.
        await c.query('UPDATE usuarios SET nombre_usuario=$1 WHERE id_usuario=$2', ['legado%' + sufijo, parecido.id_usuario]);
        r = await buscar('%'); assert.equal(r.body.data.totalItems, 1);
        assert.deepEqual(r.body.data.data.map(u => u.id_usuario), [parecido.id_usuario]);
        await c.query('UPDATE usuarios SET nombre_usuario=$1 WHERE id_usuario=$2', ['legado\\' + sufijo, parecido.id_usuario]);
        r = await buscar('\\'); assert.equal(r.body.data.totalItems, 1);
        assert.deepEqual(r.body.data.data.map(u => u.id_usuario), [parecido.id_usuario]);
        sinSecretos(r);
    });
    it('c009-1 B-08 conserva totales al pedir una página vacía o un filtro sin resultados', async () => {
        let r = await client.get('/api/usuarios?page=999&pageSize=1', { token: admin });
        assert.equal(r.status, 200);
        assert.deepEqual(r.body.data, { data: [], totalItems: 2, totalPages: 2, currentPage: 999 });
        r = await client.get('/api/usuarios?estado=inactivos', { token: admin });
        assert.equal(r.status, 200);
        assert.deepEqual(r.body.data, { data: [], totalItems: 0, totalPages: 0, currentPage: 1 });
    });
    it('B-09 valida nombres, clave configurable, roles y duplicados case-insensitive en alta y edición', async () => {
        const politica = await client.get('/api/usuarios/politica-contrasena', { token: admin });
        assert.equal(politica.status, 200); assert.deepEqual(politica.body.data, { longitudMinima: 12, longitudMaximaBytes: 72 });
        const base = { nombre_usuario: 'Nombre_Valido', contrasena: CLAVE, id_rol: 2 };
        const invalidos = [
            ...['', ' ', 'ab', 'x'.repeat(51), ' usuario', 'usuario ', 'con espacio', 'ábc', 'mal<script>'].map(nombre_usuario => ({ nombre_usuario })),
            ...['Abc12345678', 'solamenteletras', '123456789012', 'Nombre_Valido', 'á'.repeat(36) + '1', false, [], 123].map(contrasena => ({ contrasena })),
            ...[0, -1, 'abc', 1.5, 99999, 2147483648, null, {}, []].map(id_rol => ({ id_rol })),
        ];
        for (const invalido of invalidos) {
            const body = { ...base, ...invalido };
            assert.equal((await client.post('/api/usuarios', { token: admin, body })).status, 400);
            assert.equal((await editar(2, body, admin)).status, 400);
        }
        const creado = await crear('Mi_Usuario');
        for (const r of [await client.post('/api/usuarios', { token: admin, body: { ...base, nombre_usuario: 'MI_USUARIO' } }), await editar(2, { ...base, nombre_usuario: 'mi_usuario' }, admin)]) {
            assert.equal(r.status, 409); assert.equal(r.body.message, DUPLICADO); sinSecretos(r);
        }
        for (const activo of [undefined, null, 0, 1, 'false', 'true', []]) assert.equal((await estado(creado.id_usuario, activo, admin)).status, 400);
    });
    it('B-09 cuenta histórica conserva nombre fuera de formato al cambiar rol/clave/estado', async () => {
        await c.query("UPDATE usuarios SET nombre_usuario='Cuenta histórica' WHERE id_usuario=2");
        const r = await editar(2, { nombre_usuario: 'Cuenta histórica', id_rol: 1, contrasena: CLAVE }, admin);
        assert.equal(r.status, 200); assert.equal(await version(2), 1);
        assert.equal((await estado(2, false, admin)).status, 200);
        assert.equal((await editar(2, { nombre_usuario: 'Otra histórica', id_rol: 1 }, admin)).status, 400);
    });
    it('B-10 protege rol y estado propios; permite cambiar clave propia e invalida su sesión', async () => {
        const rol = await editar(1, { nombre_usuario: 'admin_prueba', id_rol: 2 }, admin);
        const activo = await estado(1, false, admin);
        for (const r of [rol, activo]) { assert.equal(r.status, 409); assert.equal(r.body.message, PROPIA); }
        assert.deepEqual((await c.query('SELECT id_rol, activo, version_sesion FROM usuarios WHERE id_usuario=1')).rows[0], { id_rol: 1, activo: true, version_sesion: 0 });
        assert.equal((await editar(1, { nombre_usuario: 'admin_prueba', id_rol: 1, contrasena: CLAVE }, admin)).status, 200);
        await invalida(admin); assert.equal(await version(1), 1);
        await login(server.baseUrl, 'admin_prueba', CLAVE);
    });
    it('B-11 permite quitar un admin y bloquea al último en petición ya autorizada; libera bloqueo', async () => {
        await crear('Admin_Segundo', 1);
        const token = await login(server.baseUrl, 'Admin_Segundo', CLAVE);
        // Mantiene el bloqueo mientras ambas peticiones superan verifyToken.
        await c.query('BEGIN'); await c.query('SELECT pg_advisory_xact_lock(704008,1)');
        const primera = estado(3, false, admin);
        await esperarBloqueados(1);
        const segunda = editar(1, { nombre_usuario: 'admin_prueba', id_rol: 2 }, token);
        await esperarBloqueados(2);
        await c.query('COMMIT');
        const r1 = await primera, r2 = await segunda;
        assert.equal(r1.status, 200); assert.equal(r2.status, 409); assert.equal(r2.body.message, ULTIMO);
        await sinBloqueos();
    });
    async function esperarBloqueados(total) {
        const limite = Date.now() + 5000;
        while (Date.now() < limite) {
            const r = await c.query("SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND classid=704008 AND objid=1 AND NOT granted");
            if (r.rows[0].n === total) return;
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        // No deja el candado retenido si falla la preparación de la concurrencia.
        await c.query('ROLLBACK'); assert.fail('No llegaron todas las peticiones al bloqueo consultivo');
    }
    async function sinBloqueos() {
        assert.equal((await c.query("SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND classid=704008 AND objid=1")).rows[0].n, 0);
        assert.equal((await c.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction'")).rows[0].n, 0);
    }
    for (const modo of ['estado', 'rol']) {
        it(`B-12 concurrencia ${modo}: exactamente un 200 y un 409, queda un admin y ningún bloqueo pendiente`, async () => {
            await crear('Admin_Concurrente', 1);
            const otro = await login(server.baseUrl, 'Admin_Concurrente', CLAVE);
            await c.query('BEGIN'); await c.query('SELECT pg_advisory_xact_lock(704008,1)');
            const peticiones = modo === 'estado'
                ? [estado(3, false, admin), estado(1, false, otro)]
                : [editar(3, { nombre_usuario: 'Admin_Concurrente', id_rol: 2 }, admin), editar(1, { nombre_usuario: 'admin_prueba', id_rol: 2 }, otro)];
            await esperarBloqueados(2); await c.query('COMMIT');
            const respuestas = await Promise.all(peticiones);
            assert.deepEqual(respuestas.map(r => r.status).sort(), [200, 409]);
            assert.equal(respuestas.find(r => r.status === 409).body.message, ULTIMO);
            assert.equal((await c.query('SELECT count(*)::int n FROM usuarios WHERE id_rol=1 AND activo')).rows[0].n, 1);
            await sinBloqueos();
        });
    }
    it('B-13 DELETE existente devuelve 409 exacto y conserva cuenta e historial', async () => {
        const antes = (await c.query('SELECT id_usuario, nombre_usuario, activo, version_sesion FROM usuarios ORDER BY id_usuario')).rows;
        for (const id of [1, 2]) {
            const r = await client.delete(`/api/usuarios/${id}`, { token: admin }); assert.equal(r.status, 409);
            assert.equal(r.body.message, 'Las cuentas no se eliminan: desactívela para conservar su historial.'); sinSecretos(r);
        }
        assert.deepEqual((await c.query('SELECT id_usuario, nombre_usuario, activo, version_sesion FROM usuarios ORDER BY id_usuario')).rows, antes);
        await sinBloqueos();
    });
});


describe('U2 c009-1/c009-3 regresiones de instantánea y coste de bcrypt (esquema reconstruido)', () => {
    let pool, controlador, lector, escritor;
    before(async () => {
        recreateDatabase();
        Object.assign(process.env, envBD(DB_CONFIG.database));
        pool = require('../config/database');
        controlador = require('../controllers/usuariosController');
        lector = new Client(DB_CONFIG); escritor = new Client(DB_CONFIG);
        await lector.connect(); await escritor.connect();
    });
    beforeEach(() => resetSchemaAndData());
    after(async () => {
        if (lector) await lector.end();
        if (escritor) await escritor.end();
        if (pool) await pool.end();
    });
    const respuesta = () => ({ status(codigo) { this.codigo = codigo; return this; }, json(body) { this.body = body; } });
    it('c009-1 B-08 una desactivación confirmada entre recuento y página no mezcla instantáneas', async () => {
        const consulta = pool.query, conectar = pool.connect;
        let intercalada = false, liberaciones = 0;
        const leer = async (...args) => {
            const r = await lector.query(...args);
            if (/SELECT count\(\*\)::int AS total FROM usuarios/.test(args[0]) && !intercalada) {
                intercalada = true;
                await escritor.query('UPDATE usuarios SET activo=false WHERE id_usuario=2');
            }
            return r;
        };
        // Intercepta la frontera de lectura real en ambos diseños: pool directo
        // (implementación anterior) y cliente transaccional (corrección).
        pool.query = leer;
        pool.connect = async () => ({ query: leer, release() { liberaciones++; } });
        try {
            const res = respuesta();
            await controlador.getAllUsuarios({ query: { estado: 'activos' } }, res);
            assert.equal(res.codigo, 200); assert.equal(intercalada, true);
            assert.equal(res.body.data.totalItems, 2);
            assert.equal(res.body.data.data.length, 2);
            assert.ok(res.body.data.data.every(u => u.activo));
            assert.equal((await escritor.query('SELECT activo FROM usuarios WHERE id_usuario=2')).rows[0].activo, false);
            assert.equal(liberaciones, 1);
            const despues = respuesta();
            await controlador.getAllUsuarios({ query: { estado: 'activos' } }, despues);
            assert.equal(despues.body.data.totalItems, 1); assert.equal(despues.body.data.data.length, 1);
            assert.equal(liberaciones, 2);
        } finally {
            await lector.query('ROLLBACK'); pool.query = consulta; pool.connect = conectar;
        }
    });
    it('c009-3 B-09 nombres ocupados y roles inexistentes se rechazan sin calcular hash ni tomar bloqueo', async () => {
        const bcrypt = require('bcrypt'), hash = bcrypt.hash, conectar = pool.connect;
        let hashes = 0, conexiones = 0;
        bcrypt.hash = async () => { hashes++; throw new Error('No debe calcular bcrypt para una petición rechazada'); };
        pool.connect = (...args) => { conexiones++; return conectar.apply(pool, args); };
        try {
            for (const [metodo, body, esperado, mensaje] of [
                ['createUsuario', { nombre_usuario: 'nuevo_c009', id_rol: 99999, contrasena: CLAVE }, 400, 'El rol no existe.'],
                ['createUsuario', { nombre_usuario: 'ADMIN_PRUEBA', id_rol: 2, contrasena: CLAVE }, 409, DUPLICADO],
                ['updateUsuario', { nombre_usuario: 'usuario_prueba', id_rol: 99999, contrasena: CLAVE }, 400, 'El rol no existe.'],
                ['updateUsuario', { nombre_usuario: 'ADMIN_PRUEBA', id_rol: 2, contrasena: CLAVE }, 409, DUPLICADO],
            ]) {
                const res = respuesta();
                await controlador[metodo]({ body, params: { id: '2' }, usuario: { idUsuario: 1 } }, res);
                assert.equal(res.codigo, esperado); assert.equal(res.body.message, mensaje);
            }
            assert.equal(hashes, 0);
            // pool.query también usa connect; se comprueba el bloqueo en pg_locks,
            // sin confundir esas consultas breves con una transacción de escritura.
            assert.ok(conexiones > 0);
            assert.equal((await escritor.query("SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND classid=704008 AND objid=1")).rows[0].n, 0);
        } finally { bcrypt.hash = hash; pool.connect = conectar; }
    });
    it('c009-3 B-09 bcrypt se ejecuta después de comprobar rol/nombre y antes del bloqueo, con revisión definitiva posterior', async () => {
        const bcrypt = require('bcrypt'), hash = bcrypt.hash;
        let hashes = 0;
        bcrypt.hash = async (...args) => {
            hashes++;
            assert.equal((await escritor.query("SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND classid=704008 AND objid=1")).rows[0].n, 0);
            // Simula una carrera: el nombre queda ocupado mientras bcrypt trabaja.
            await escritor.query("UPDATE usuarios SET nombre_usuario='libre_c009' WHERE id_usuario=2");
            return hash.apply(bcrypt, args);
        };
        try {
            const res = respuesta();
            await controlador.createUsuario({ body: { nombre_usuario: 'libre_c009', id_rol: 2, contrasena: CLAVE } }, res);
            assert.equal(hashes, 1); assert.equal(res.codigo, 409); assert.equal(res.body.message, DUPLICADO);
            assert.equal((await escritor.query('SELECT count(*)::int n FROM usuarios')).rows[0].n, 2);
        } finally { bcrypt.hash = hash; }
    });
});
