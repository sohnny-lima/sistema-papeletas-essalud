const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const { spawnSync } = require('node:child_process');
const { checkEnv, databaseConfig } = require('../config/env');
const { passwordError } = require('../utils/passwordPolicy');
const { procesarTecla } = require('../utils/claveTerminal');
const { logError } = require('../utils/securityLog');
const { recreateDatabase, startServer, api, login, USERS, DB_CONFIG, BACKEND_DIR, runPsql } = require('./helpers');

function entorno() {
    return { NODE_ENV:'production', DB_HOST:'localhost', DB_PORT:'55432', DB_USER:'postgres',
        DB_NAME:'bd_papeleta_ci', DB_PASSWORD:crypto.randomBytes(16).toString('hex'),
        JWT_SECRET:crypto.randomBytes(32).toString('hex'), CLIENT_URL:'http://localhost:4200' };
}

describe('g010 #2 secretos exactos y configuración', () => {
    for (const [nombre,antes,despues] of [['espacio inicial',' ',''],['espacio final','',' '],['tabulador inicial','\t',''],['tabulador final','','\t'],['dos saltos LF','','\n\n'],['dos saltos CRLF','','\r\n\r\n']]) {
        for (const archivo of [false,true]) {
            it(`g010 #2 rechaza ${nombre} en JWT_SECRET ${archivo?'por archivo':'directo'}`, () => {
                const env=entorno();const valor=antes+env.JWT_SECRET+despues;
                const dir=fs.mkdtempSync(path.join(os.tmpdir(),'papeletas-g010-'));
                try {
                    if(archivo) { env.JWT_SECRET_FILE=path.join(dir,'secreto');fs.writeFileSync(env.JWT_SECRET_FILE,valor); }
                    else env.JWT_SECRET=valor;
                    const {errors}=checkEnv(env);
                    assert.ok(errors.some(e=>/JWT_SECRET.*extremos/.test(e)));
                    assert.ok(!errors.join(' ').includes(valor));
                    assert.equal(env.JWT_SECRET,archivo?valor.replace(/\r?\n$/,''):valor,'No hay recorte silencioso de espacios');
                } finally {fs.rmSync(dir,{recursive:true,force:true});}
            });
        }
    }
    it('g010 #2 DB_PASSWORD de espacios o tabuladores es vacío en producción', () => {
        for(const DB_PASSWORD of ['   ','\t',' \t ']) {
            assert.ok(checkEnv({...entorno(),DB_PASSWORD}).errors.some(e=>e.includes('DB_PASSWORD')));
        }
    });
    it('g010 #2 databaseConfig carga DB_PASSWORD_FILE y conserva el valor exacto', () => {
        const env=entorno();const dir=fs.mkdtempSync(path.join(os.tmpdir(),'papeletas-g010-db-'));
        const clave=crypto.randomBytes(24).toString('hex');
        try {
            env.DB_PASSWORD_FILE=path.join(dir,'clave');fs.writeFileSync(env.DB_PASSWORD_FILE,clave+'\r\n');
            assert.equal(databaseConfig(env).password,clave);
            fs.writeFileSync(env.DB_PASSWORD_FILE,'   \n');assert.throws(()=>databaseConfig(env),/DB_PASSWORD/);
        } finally {fs.rmSync(dir,{recursive:true,force:true});}
    });
    it('g010 #2 arranque rechaza espacios sin mostrar el secreto', () => {
        const env={...process.env,...entorno(),JWT_SECRET_FILE:'',DB_PASSWORD_FILE:''};env.JWT_SECRET+=' ';
        const res=spawnSync(process.execPath,[path.join(BACKEND_DIR,'index.js')],{env,cwd:os.tmpdir(),encoding:'utf8',timeout:8000});
        assert.equal(res.status,1);assert.match(res.stderr,/JWT_SECRET.*extremos/);assert.ok(!res.stderr.includes(env.JWT_SECRET));
    });
});

describe('g010 #3 usuarios y g010 #6 límite de login (esquema reconstruido)', () => {
    let servidor,cliente,admin;
    before(async()=>{
        recreateDatabase();servidor=await startServer({port:3107,env:{LOGIN_RATE_LIMIT_MAX:'1000'}});
        cliente=api(servidor.baseUrl);admin=await login(servidor.baseUrl,USERS.admin.usuario,USERS.admin.clave);
    });
    after(async()=>{if(servidor)await servidor.stop();});
    for(const nombre of ['', '   ', '\t', ' usuario_g010','usuario_g010 ','\tusuario_g010','usuario_g010\t']) {
        it(`g010 #3 alta y edición rechazan nombre con extremos inválidos (${JSON.stringify(nombre)})`,async()=>{
            const body={nombre_usuario:nombre,contrasena:'Clave.valida123',id_rol:2};
            assert.equal((await cliente.post('/api/usuarios',{token:admin,body})).status,400);
            assert.equal((await cliente.put('/api/usuarios/2',{token:admin,body:{...body,contrasena:''}})).status,400);
            const actual=await cliente.get('/api/usuarios/2',{token:admin});
            assert.equal(actual.body.data.nombre_usuario,USERS.user.usuario);
        });
    }
    it('g010 #3 passwordError compara con el nombre recortado',()=>{
        assert.match(passwordError(' Usuario1234 ','usuario1234'),/distinta/);
    });
    it('g010 #3 crear-admin rechaza nombres inválidos sin crear ni modificar cuentas',()=>{
        const env={...process.env,...entorno(),NODE_ENV:'test',DB_PASSWORD:DB_CONFIG.password,JWT_SECRET_FILE:'',DB_PASSWORD_FILE:''};
        const clave=crypto.randomBytes(24).toString('hex')+'Ab1';
        for(const nombre of ['   ',' admin_g010','admin_g010 ','\tadmin_g010']) {
            const res=spawnSync(process.execPath,['scripts/crear-admin.js',nombre],{cwd:BACKEND_DIR,env,input:clave,encoding:'utf8',timeout:8000});
            assert.equal(res.status,1);assert.match(res.stderr,/nombre de usuario/i);assert.ok(!res.stderr.includes(clave));
        }
        assert.equal(runPsql(['-d',DB_CONFIG.database,'-t','-A','-c','SELECT count(*) FROM usuarios']).trim(),'2');
    });
    it('g010 #6 los 503 no consumen intentos, pero el 400 sí',async()=>{
        // Reserva un puerto libre y lo cierra antes de simular una base no disponible.
        const reserva=net.createServer();await new Promise(r=>reserva.listen(0,'127.0.0.1',r));
        const puerto=reserva.address().port;await new Promise(r=>reserva.close(r));
        const caido=await startServer({port:3106,env:{DB_HOST:'127.0.0.1',DB_PORT:String(puerto),LOGIN_RATE_LIMIT_MAX:'2',DB_CONNECTION_TIMEOUT_MS:'500'}});
        try {
            const c=api(caido.baseUrl);
            for(let i=0;i<5;i++) assert.equal((await c.post('/api/auth/login',{body:{nombreUsuario:'ficticio',contrasena:'Incorrecta123'}})).status,503);
            for(let i=0;i<2;i++) assert.equal((await c.post('/api/auth/login',{body:{}})).status,400);
            assert.equal((await c.post('/api/auth/login',{body:{}})).status,429);
        } finally {await caido.stop();}
    });
});

describe('g010 #4 procesamiento de teclas sin terminal',()=>{
    it('g010 #4 ignora Escape, Tab, Supr, navegación y todos los caracteres de control',()=>{
        for(const name of ['escape','tab','delete','up','down','left','right','home','end','pageup','pagedown','insert']) {
            assert.deepEqual(procesarTecla('Clave1','texto',{name}),{clave:'Clave1',accion:'continuar'});
        }
        for(const codigo of [...Array(32).keys(),127]) {
            assert.equal(procesarTecla('Clave1',String.fromCharCode(codigo)).clave,'Clave1');
        }
        assert.equal(procesarTecla('Clave1','\x1b[A').clave,'Clave1');
    });
    it('g010 #4 Ctrl+C y Ctrl+D cancelan; Enter termina y Backspace borra un carácter',()=>{
        for(const name of ['c','d']) assert.equal(procesarTecla('Clave1',undefined,{ctrl:true,name}).accion,'cancelar');
        assert.equal(procesarTecla('Clave1','\r',{name:'return'}).accion,'terminar');
        assert.equal(procesarTecla('Clave1😀','\b',{name:'backspace'}).clave,'Clave1');
        assert.equal(procesarTecla('Clave1','á😀').clave,'Clave1á😀');
    });
});

describe('g010 #5 metadatos de error permitidos y registro único',()=>{
    it('g010 #5 errores SQL incluyen tabla/restricción y nunca detail/message/where ni valores inválidos',()=>{
        const lineas=[],original=console.error;console.error=(linea)=>lineas.push(linea);
        try {
            for(const code of ['23505','23503']) logError('Error controlado',{code,name:'DatabaseError',table:'usuarios',column:'id_rol',constraint:'usuarios_id_rol_fkey',routine:'ri_ReportViolation',detail:'DATO_PRIVADO',message:'CLAVE_PRIVADA',where:'VALOR_PRIVADO'});
            for(const valor of ['un espacio','con.punto','123invalido','x'.repeat(64),'\nvalor']) logError('Error controlado',{name:valor,table:valor,column:valor,constraint:valor,routine:valor});
        } finally {console.error=original;}
        for(const linea of lineas.slice(0,2)) {
            assert.match(linea,/name=DatabaseError/);assert.match(linea,/table=usuarios/);assert.match(linea,/constraint=usuarios_id_rol_fkey/);assert.match(linea,/column=id_rol/);assert.match(linea,/routine=ri_ReportViolation/);
            assert.doesNotMatch(linea,/DATO_PRIVADO|CLAVE_PRIVADA|VALOR_PRIVADO|detail|message|where/);
        }
        for(const linea of lineas.slice(2)) assert.equal(linea,'Error controlado [ERROR_INTERNO]');
    });
    it('g010 #5 controlador y errorResponse emiten una sola línea por error',async()=>{
        Object.assign(process.env,{DB_HOST:DB_CONFIG.host,DB_PORT:String(DB_CONFIG.port),DB_USER:DB_CONFIG.user,DB_NAME:DB_CONFIG.database,DB_PASSWORD:DB_CONFIG.password});
        const pool=require('../config/database');const originalQuery=pool.query,originalConnect=pool.connect,originalError=console.error,lineas=[];
        const error={code:'23503',name:'DatabaseError',table:'usuarios',constraint:'usuarios_id_rol_fkey',detail:'PRIVADO'};
        pool.query=async()=>{throw error;};
        pool.connect=async()=>({query:async sql=>{if(sql.startsWith('SELECT 1 FROM roles'))throw error;return {rows:[]};},release(){}});
        console.error=(linea)=>lineas.push(linea);
        const res={status(codigo){this.codigo=codigo;return this;},json(body){this.body=body;}};
        try {
            const usuarios=require('../controllers/usuariosController');
            await usuarios.getUsuarioById({params:{id:1}},res);
            assert.equal(lineas.length,1);assert.match(lineas[0],/constraint=usuarios_id_rol_fkey/);assert.doesNotMatch(lineas[0],/PRIVADO/);
            lineas.length=0;
            await usuarios.createUsuario({body:{nombre_usuario:'ficticio_g010',contrasena:'Clave.valida123',id_rol:2}},res);
            assert.equal(res.codigo,400);assert.equal(lineas.length,1);
        } finally {pool.query=originalQuery;pool.connect=originalConnect;console.error=originalError;await pool.end();}
    });
});
