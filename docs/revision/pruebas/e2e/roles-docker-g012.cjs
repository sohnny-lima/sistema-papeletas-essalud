// g012 #1: ejecutar con el servicio operaciones y secretos ficticios, en Docker desechable.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { Client } = require('/app/node_modules/pg');
const { databaseConfig } = require('/app/config/env');
const config = databaseConfig();
const propietario = new Client(config);
const app = new Client({ ...config, user: 'papeletas_app', password: fs.readFileSync(process.env.APP_DB_PASSWORD_FILE, 'utf8').replace(/\r?\n$/, '') });
async function denegado(sql) {
    await assert.rejects(app.query(sql), e => e.code === '42501');
}
(async () => {
    let creada = false;
    try {
        await propietario.connect(); await app.connect();
        const { rows: [rol] } = await propietario.query("SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolinherit FROM pg_roles WHERE rolname='papeletas_app'");
        assert.ok(Object.values(rol).every(v => v === false));
        await app.query('SELECT count(*) FROM usuarios');
        await denegado('CREATE TABLE public.prohibida_g012(id integer)');
        await denegado('CREATE TEMP TABLE prohibida_g012(id integer)');
        await denegado('CREATE SCHEMA prohibido_g012');
        await denegado('DROP TABLE usuarios');
        await denegado('SET ROLE papeletas_admin');
        await propietario.query('CREATE TABLE public.futura_g012(id serial primary key, valor text)'); creada = true;
        const { rows: [fila] } = await app.query("INSERT INTO futura_g012(valor) VALUES ('ficticio') RETURNING id");
        await app.query("UPDATE futura_g012 SET valor='editado' WHERE id=$1", [fila.id]);
        assert.equal((await app.query('SELECT valor FROM futura_g012 WHERE id=$1', [fila.id])).rows[0].valor, 'editado');
        await app.query('DELETE FROM futura_g012 WHERE id=$1', [fila.id]);
        await denegado('TRUNCATE futura_g012');
        await denegado("SELECT setval('futura_g012_id_seq',100)");
        console.log('g012 #1: API sin superusuario/DDL/TEMP/SET ROLE/TRUNCATE/setval; DML y secuencia de tabla futura por defecto: OK.');
    } finally {
        if (creada) await propietario.query('DROP TABLE public.futura_g012');
        await app.end(); await propietario.end();
    }
})().catch(e => { console.error('Prueba de roles falló:', e.code || e.name); process.exitCode = 1; });
