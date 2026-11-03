const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const jwt = require('jsonwebtoken');
const { checkEnv, loadSecrets } = require('../config/env');
const { passwordError } = require('../utils/passwordPolicy');
const { recreateDatabase, startServer, api, login, USERS, DB_CONFIG, runPsql, BACKEND_DIR, REPO_ROOT } = require('./helpers');

const envValido = () => ({ NODE_ENV: 'production', DB_HOST: 'localhost', DB_PORT: '55432', DB_USER: 'postgres', DB_NAME: 'bd_papeleta_ci', DB_PASSWORD: crypto.randomBytes(16).toString('hex'), JWT_SECRET: crypto.randomBytes(32).toString('hex'), CLIENT_URL: 'http://localhost:4200' });

describe('c003 A5 configuración y JWT', () => {
    for (const nombre of ['JWT_SECRET','DB_HOST','DB_PORT','DB_USER','DB_NAME','DB_PASSWORD']) {
        it(`A5 arranque en producción sin ${nombre} falla sin mostrar valores`, () => {
            const env = {...process.env, ...envValido(), DOTENV_CONFIG_PATH: ''};
            delete env[nombre]; delete env.JWT_SECRET_FILE; delete env.DB_PASSWORD_FILE;
            const res = spawnSync(process.execPath, [path.join(BACKEND_DIR,'index.js')], {cwd:os.tmpdir(), env, encoding:'utf8',timeout:8000});
            assert.equal(res.status,1, res.error?.message);
            assert.match(res.stderr, new RegExp(nombre));
            if (env.JWT_SECRET) assert.ok(!res.stderr.includes(env.JWT_SECRET));
        });
    }
    it('A5 secreto corto en producción detiene el arranque', () => {
        const res=spawnSync(process.execPath,[path.join(BACKEND_DIR,'index.js')],{cwd:os.tmpdir(),env:{...process.env,...envValido(),JWT_SECRET:'corto',JWT_SECRET_FILE:''},encoding:'utf8',timeout:8000});
        assert.equal(res.status,1); assert.match(res.stderr,/JWT_SECRET.*32/);
    });
    it('A5 archivos tienen prioridad y su lectura fallida no expone rutas', () => {
        const dir=fs.mkdtempSync(path.join(os.tmpdir(),'papeletas-secret-'));
        try {
            const archivo=path.join(dir,'secreto'); const secreto=crypto.randomBytes(32).toString('hex');
            fs.writeFileSync(archivo,secreto+'\r\n');
            const env={...envValido(),JWT_SECRET:'directo',DB_PASSWORD:'directo',JWT_SECRET_FILE:archivo,DB_PASSWORD_FILE:archivo};
            assert.deepEqual(checkEnv(env).errors,[]);
            assert.equal(env.JWT_SECRET,secreto); assert.equal(env.DB_PASSWORD,secreto);
            const errores=loadSecrets({JWT_SECRET_FILE:path.join(dir,'ausente')});
            assert.equal(errores.length,1); assert.ok(!errores[0].includes(dir));
        } finally {fs.rmSync(dir,{recursive:true,force:true});}
    });
    it('A3/A7 configuración inválida falla y el mínimo no se puede bajar de 10', () => {
        for(const [nombre,valor] of [['PASSWORD_MIN_LENGTH','9'],['LOGIN_RATE_LIMIT_MAX','0'],['LOGIN_RATE_LIMIT_WINDOW_MS','NaN'],['TRUST_PROXY','true'],['JWT_EXPIRES_IN','-1h']]) {
            assert.ok(checkEnv({...envValido(),[nombre]:valor}).errors.some(e=>e.includes(nombre)));
        }
    });
    it('A7 política: letra, número, longitud, distinto del usuario y límite bcrypt', () => {
        for(const clave of ['corta1','solamenteletras','1234567890','Usuario1234','á'.repeat(36)+'1']) assert.ok(passwordError('Usuario1234',clave));
        assert.equal(passwordError('usuario','Clave.valida123'),null);
        assert.ok(passwordError('usuario','Clave.valida123',{PASSWORD_MIN_LENGTH:'20'}));
    });
});

describe('c003 seguridad HTTP y rutas privadas (esquema reconstruido)', () => {
    let server,client,admin;
    before(async()=>{recreateDatabase();server=await startServer({port:3108});client=api(server.baseUrl);admin=await login(server.baseUrl,USERS.admin.usuario,USERS.admin.clave);});
    after(async()=>{if(server) await server.stop();});
    const recursos=['papeletas','trabajadores','equipos','lugares','registro_movimientos','estadisticas','centros_asistenciales','estados_papeletas','papeleta_equipos','roles','tipo_formulario','usuarios'];
    for (const recurso of recursos) {
        const metodos=recurso==='estadisticas'?['GET']:recurso==='registro_movimientos'?['GET']:['GET','POST','PUT','DELETE'];
        for(const metodo of metodos) {
            it(`A10 ${metodo} /api/${recurso} sin token devuelve 401`,async()=>{
                const ruta=`/api/${recurso}${['PUT','DELETE'].includes(metodo)?'/1':''}`;
                assert.equal((await client(metodo,ruta,{body:metodo==='POST'||metodo==='PUT'?{}:undefined})).status,401);
            });
        }
        if(recurso!=='estadisticas') {
            it(`A10 GET /api/${recurso}/1 sin token devuelve 401`,async()=>assert.equal((await client.get(`/api/${recurso}/1`)).status,401));
            for (const metodo of ['GET',...(recurso==='registro_movimientos'?[]:['PUT','DELETE'])]) {
                it(`E3 ${metodo} /api/${recurso}/abc devuelve 400`,async()=>{
                    for (const id of ['abc','1.5','0','-1','2147483648']) assert.equal((await client(metodo,`/api/${recurso}/${id}`,{token:admin,body:metodo==='PUT'?{}:undefined})).status,400);
                });
            }
        }
    }
    for(const ruta of ['/api/lugares/search','/api/registro_movimientos/filtro','/api/papeletas/trabajadores/buscar','/api/papeletas/search/equipos','/api/papeletas/last/number','/api/papeletas/tipos/formulario']) {
        it(`A10 GET ${ruta} sin token devuelve 401`,async()=>assert.equal((await client.get(ruta)).status,401));
    }
    it('JWT rechaza HS384, HS512 y expirado; permite HS256',async()=>{
        for(const opciones of [{algorithm:'HS384'},{algorithm:'HS512'},{algorithm:'HS256',expiresIn:-1}]) {
            const token=jwt.sign({idUsuario:1,rol:'admin'},server.jwtSecret,opciones);
            assert.equal((await client.get('/api/estadisticas',{token})).status,401);
        }
        assert.equal((await client.get('/api/estadisticas',{token:admin})).status,200);
    });
    it('E5 JSON inválido es 400 y 100kb es el límite; sin datos internos',async()=>{
        const res=await client.post('/api/auth/login',{rawBody:'{"dato_sensible":'});
        assert.equal(res.status,400); assert.doesNotMatch(res.text,/stack|SyntaxError|dato_sensible|node_modules|[A-Z]:\\/);
        assert.equal((await client.post('/api/auth/login',{body:{dato:'x'.repeat(102401)}})).status,413);
    });
    it('A11 cabeceras y CORS limitado a CLIENT_URL',async()=>{
        const res=await client.get('/',{headers:{Origin:'https://origen-ajeno.invalid'}});
        assert.equal(res.headers.get('x-powered-by'),null);
        assert.equal(res.headers.get('x-content-type-options'),'nosniff');
        assert.ok(res.headers.get('content-security-policy'));
        assert.equal(res.headers.get('access-control-allow-origin'),'http://localhost:4200');
    });
    it('E6 detalle de lugar y búsquedas funcionan; paginación acotada en los cuatro listados',async()=>{
        assert.equal((await client.get('/api/lugares/1',{token:admin})).status,200);
        assert.equal((await client.get('/api/lugares/2147483647',{token:admin})).status,404);
        assert.equal((await client.get('/api/lugares/search?searchText=OFI',{token:admin})).status,200);
        for(const recurso of ['lugares','equipos','trabajadores','papeletas']) {
            for(const query of ['page=-1&pageSize=-5','page=1&pageSize=100000','page=999999999999999999999&pageSize=1']) {
                const res=await client.get(`/api/${recurso}?${query}`,{token:admin});
                assert.equal(res.status,200,res.text); assert.ok(res.body.data.currentPage>=1); assert.ok(res.body.data.data.length<=100);
            }
        }
    });
    it('A7 usuarios: política en alta y edición, rol inválido 400 y duplicado 409',async()=>{
        const body={nombre_usuario:'seguridad_c003',contrasena:'Clave.valida123',id_rol:2};
        for(const contrasena of ['a','solamenteletras','1234567890',body.nombre_usuario]) assert.equal((await client.post('/api/usuarios',{token:admin,body:{...body,contrasena}})).status,400);
        const alta=await client.post('/api/usuarios',{token:admin,body}); assert.equal(alta.status,200,alta.text);
        const id=alta.body.data.id_usuario;
        assert.equal((await client.put(`/api/usuarios/${id}`,{token:admin,body:{...body,contrasena:'corta1'}})).status,400);
        for(const id_rol of [999999,'abc',[],1.5]) {
            assert.equal((await client.post('/api/usuarios',{token:admin,body:{...body,nombre_usuario:'otro_c003',id_rol}})).status,400);
            assert.equal((await client.put(`/api/usuarios/${id}`,{token:admin,body:{...body,id_rol}})).status,400);
        }
        assert.equal((await client.post('/api/usuarios',{token:admin,body})).status,409);
        assert.equal((await client.put(`/api/usuarios/${id}`,{token:admin,body:{...body,nombre_usuario:USERS.user.usuario}})).status,409);
        assert.equal((await client.put(`/api/usuarios/${id}`,{token:admin,body:{...body,contrasena:''}})).status,200);
    });
});

describe('c003 A3 límite por IP y JWT configurable',()=>{
    async function probar(env, prueba) {const s=await startServer({port:3108,env}); try{await prueba(api(s.baseUrl));}finally{await s.stop();}}
    const peticion=(ip)=>({body:{nombreUsuario:'inexistente',contrasena:'incorrecta'},headers:{'X-Forwarded-For':ip}});
    it('A3 diez intentos por defecto, 429 en el siguiente y XFF ignorada sin trust proxy',async()=>{
        await probar({LOGIN_RATE_LIMIT_MAX:undefined,TRUST_PROXY:'false'},async c=>{
            for(let i=0;i<10;i++) assert.equal((await c.post('/api/auth/login',peticion(`192.0.2.${i+1}`))).status,401);
            const res=await c.post('/api/auth/login',peticion('198.51.100.1'));assert.equal(res.status,429);assert.equal(res.body.message,'Demasiados intentos. Espere unos minutos.');assert.ok(res.headers.get('retry-after'));
        });
    });
    it('A3 límite y ventana configurables; proxy explícito separa clientes',async()=>{
        await probar({LOGIN_RATE_LIMIT_MAX:'1',LOGIN_RATE_LIMIT_WINDOW_MS:'1000',TRUST_PROXY:'1'},async c=>{
            assert.equal((await c.post('/api/auth/login',peticion('192.0.2.1'))).status,401);
            assert.equal((await c.post('/api/auth/login',peticion('192.0.2.1'))).status,429);
            assert.equal((await c.post('/api/auth/login',peticion('192.0.2.2'))).status,401);
            await new Promise(r=>setTimeout(r,1100));
            assert.equal((await c.post('/api/auth/login',peticion('192.0.2.1'))).status,401);
        });
    });
    it('A3 los accesos correctos no consumen el límite (IP compartida por varios usuarios)',async()=>{
        await probar({LOGIN_RATE_LIMIT_MAX:'2',TRUST_PROXY:'false'},async c=>{
            const correcto={body:{nombreUsuario:USERS.user.usuario,contrasena:USERS.user.clave}};
            for(let i=0;i<5;i++) assert.equal((await c.post('/api/auth/login',correcto)).status,200);
            assert.equal((await c.post('/api/auth/login',peticion('192.0.2.1'))).status,401);
            assert.equal((await c.post('/api/auth/login',peticion('192.0.2.1'))).status,401);
            assert.equal((await c.post('/api/auth/login',peticion('192.0.2.1'))).status,429);
        });
    });
    it('JWT_EXPIRES_IN se aplica al token emitido',async()=>{
        await probar({JWT_EXPIRES_IN:'5m'},async c=>{
            const res=await c.post('/api/auth/login',{body:{nombreUsuario:USERS.user.usuario,contrasena:USERS.user.clave}});
            assert.equal(res.status,200);const data=jwt.decode(res.body.token);assert.equal(data.exp-data.iat,300);
        });
    });
    it('A5 JWT_SECRET_FILE firma con el archivo aunque exista la variable directa',async()=>{
        const dir=fs.mkdtempSync(path.join(os.tmpdir(),'papeletas-jwt-'));
        const secreto=crypto.randomBytes(32).toString('hex');const archivo=path.join(dir,'secreto');
        fs.writeFileSync(archivo,secreto+'\n');
        try {
            await probar({JWT_SECRET_FILE:archivo},async c=>{
                const res=await c.post('/api/auth/login',{body:{nombreUsuario:USERS.user.usuario,contrasena:USERS.user.clave}});
                assert.equal(res.status,200);
                assert.equal(jwt.verify(res.body.token,secreto,{algorithms:['HS256']}).rol,'user');
            });
        } finally {fs.rmSync(dir,{recursive:true,force:true});}
    });
});

describe('c003 A3 tiempo de bcrypt, A10 verificación única y E10/E11 registros',()=>{
    let pool;
    before(()=>{
        Object.assign(process.env,{DB_HOST:DB_CONFIG.host,DB_PORT:String(DB_CONFIG.port),DB_USER:DB_CONFIG.user,DB_NAME:DB_CONFIG.database,DB_PASSWORD:DB_CONFIG.password,JWT_SECRET:crypto.randomBytes(32).toString('hex')});
        pool=require('../config/database');
    });
    after(async()=>{await pool.end();});
    it('A3 usuario inexistente también ejecuta una comparación bcrypt',async()=>{
        const bcrypt=require('bcrypt'), consulta=pool.query, comparar=bcrypt.compare;
        const hashes=[];const respuestas=[];
        pool.query=async()=>({rows:[]});bcrypt.compare=async(clave,hash)=>{hashes.push(hash);return false;};
        try {
            const {login:autenticar}=require('../controllers/authController');
            const res={status(codigo){this.codigo=codigo;return this;},json(body){respuestas.push({status:this.codigo,body});}};
            await autenticar({body:{nombreUsuario:'ausente',contrasena:'incorrecta'}},res);
            assert.equal(hashes.length,1);assert.match(hashes[0],/^\$2[ab]\$10\$/);
            pool.query=async()=>({rows:[{contrasena:hashes[0]}]});
            await autenticar({body:{nombreUsuario:'existente',contrasena:'incorrecta'}},res);
            assert.equal(hashes.length,2);assert.deepEqual(respuestas[0],respuestas[1]);
        } finally {pool.query=consulta;bcrypt.compare=comparar;}
    });
    it('A10 cada montaje privado verifica una vez y auth/sesion verifica en su ruta',()=>{
        const app=require('../app');
        const montajes=app._router.stack.filter(capa=>capa.handle.name==='verifyToken');
        assert.equal(montajes.length,12);
        let sesiones = 0;
        for(const capa of app._router.stack.filter(c=>c.handle.stack)) {
            for(const ruta of capa.handle.stack.filter(c=>c.route)) {
                const sesion = capa.handle === require('../routes/authRoutes') && ruta.route.path === '/sesion';
                assert.equal(ruta.route.stack.filter(c=>c.handle.name==='verifyToken').length, sesion ? 1 : 0);
                if (sesion) sesiones++;
            }
        }
        assert.equal(sesiones, 1);
    });
    it('E10 error de cliente inactivo se registra sin terminar el proceso ni filtrar datos',()=>{
        const registrar=console.error;const lineas=[];
        console.error=(...args)=>lineas.push(args.join(' '));
        try {
            assert.doesNotThrow(()=>pool.emit('error',Object.assign(new Error('dato-personal-secreto'),{code:'ECONNRESET',detail:'cuerpo-sensible'})));
            assert.equal(lineas.length,1);assert.match(lineas[0],/ECONNRESET/);assert.doesNotMatch(lineas[0],/dato-personal|cuerpo-sensible|Error:/);
        } finally {console.error=registrar;}
    });
});

describe('c003 A6 crear-admin contra base temporal',()=>{
    const nombreBD='bd_papeleta_tmp_c003_admin';let dir;
    before(()=>{
        runPsql(['-d','postgres','-c',`CREATE DATABASE ${nombreBD}`]);
        dir=fs.mkdtempSync(path.join(os.tmpdir(),'papeletas-admin-'));
        const sql=path.join(REPO_ROOT,'backend-papeletas/db');
        for(const file of [path.join(sql,'esquema/001_esquema_inicial.sql'),...fs.readdirSync(path.join(sql,'migraciones')).filter(n=>n.endsWith('.sql')).sort().map(n=>path.join(sql,'migraciones',n)),path.join(sql,'demo/datos-demo.sql')]) runPsql(['-d',nombreBD,'-f',file]);
    });
    after(()=>{try{runPsql(['-d','postgres','-c',`DROP DATABASE IF EXISTS ${nombreBD}`]);}finally{if(dir)fs.rmSync(dir,{recursive:true,force:true});}});
    it('A6 crea por stdin y archivo; rechaza duplicado, débil y contraseña por argumento',()=>{
        const env={...process.env,DB_HOST:DB_CONFIG.host,DB_PORT:String(DB_CONFIG.port),DB_USER:DB_CONFIG.user,DB_NAME:nombreBD,DB_PASSWORD:DB_CONFIG.password,DB_PASSWORD_FILE:'',NODE_ENV:'test'};
        const clave=crypto.randomBytes(24).toString('hex')+'Ab1';
        function ejecutar(args,input) {return spawnSync(process.execPath,['scripts/crear-admin.js',...args],{cwd:BACKEND_DIR,env,input,encoding:'utf8',timeout:10000});}
        const alta=ejecutar(['admin_c003'],clave+'\n');assert.equal(alta.status,0,alta.stderr);assert.ok(!alta.stdout.includes(clave));
        const duplicado=ejecutar(['admin_c003'],clave);assert.equal(duplicado.status,1);assert.match(duplicado.stderr,/ya existe/);
        const debil=ejecutar(['admin_debil'],'a1\n');assert.equal(debil.status,1);assert.match(debil.stderr,/10 caracteres/);
        assert.equal(ejecutar(['admin_argumento','clave-no-permitida']).status,1);
        const archivo=path.join(dir,'clave');fs.writeFileSync(archivo,clave+'\n');
        assert.equal(ejecutar(['admin_archivo','--clave-archivo',archivo]).status,0);
        assert.equal(runPsql(['-d',nombreBD,'-t','-A','-c',"SELECT count(*) FROM usuarios WHERE nombre_usuario IN ('admin_c003','admin_archivo') AND id_rol=1"]).trim(),'2');
        assert.equal(runPsql(['-d',nombreBD,'-t','-A','-c',"SELECT count(*) FROM usuarios WHERE nombre_usuario='admin_debil'"]).trim(),'0');
    });
});
