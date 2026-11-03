#!/usr/bin/env node
// Comparación estática: nunca ejecuta el SQL recibido ni se conecta a una base.
const { fs, path, DB_DIR, TABLAS, fallo, terminar } = require('./db-comun');
const { migraciones } = require('./migrar');
const IDENTIFICADOR = '(?:"(?:[^\"]|"\")+"|[a-zA-Z_][a-zA-Z0-9_$]*)';
const CUALIFICADO = `(?:${IDENTIFICADOR}\\s*\\.\\s*)?${IDENTIFICADOR}`;
function identificador(s) { return s.startsWith('"') ? s.slice(1, -1).replaceAll('""', '"') : s.toLowerCase(); }
function tablaPublica(s) {
    const m = new RegExp(`^(?:(${IDENTIFICADOR})\\s*\\.\\s*)?(${IDENTIFICADOR})$`).exec(s);
    return m && (!m[1] || identificador(m[1]) === 'public') ? identificador(m[2]) : null;
}
// Encuentra el cierre real sin confundir paréntesis dentro de expresiones o literales.
function parentesis(sql, inicio) {
    let nivel = 1, comilla = null;
    for (let i = inicio; i < sql.length; i++) {
        const c = sql[i];
        if (comilla) {
            if (c === comilla) { if (sql[i + 1] === comilla) i++; else comilla = null; }
        } else if (c === "'" || c === '"') comilla = c;
        else if (c === '(') nivel++;
        else if (c === ')' && --nivel === 0) return { texto: sql.slice(inicio, i), fin: i + 1 };
    }
    fallo('Paréntesis SQL incompletos. Se requiere revisión manual.');
}
function partes(texto) {
    const salida = []; let inicio = 0, nivel = 0, comilla = null;
    for (let i = 0; i < texto.length; i++) {
        if (comilla) {
            if (texto[i] === comilla) { if (texto[i + 1] === comilla) i++; else comilla = null; }
        } else if (texto[i] === "'" || texto[i] === '"') comilla = texto[i];
        else {
            if (texto[i] === '(') nivel++;
            if (texto[i] === ')') nivel--;
            if (texto[i] === ',' && nivel === 0) { salida.push(texto.slice(inicio, i).trim()); inicio = i + 1; }
        }
    }
    salida.push(texto.slice(inicio).trim()); return salida;
}
function normalizar(s) {
    return s.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|[A-Z]+/g, p => {
        if (p.startsWith("'")) return p;
        if (p.startsWith('"')) return /^"[a-z_][a-z0-9_]*"$/.test(p) ? p.slice(1, -1) : p;
        return p.toLowerCase();
    }).replace(/\bpublic\./g, '')
        .replace(/::text/g, '').replace(/\s+/g, ' ').trim();
}
function clave(s) { return normalizar(s).replace(/\s*([(),])\s*/g, '$1'); }
function autogenerada(s) { return /\b(?:serial|bigserial|smallserial)\b|\bdefault\s+(?:pg_catalog\.)?nextval\s*\(|\bgenerated\s+(?:always|by default)\s+as\s+identity\b/i.test(s); }
function valorDefecto(s) {
    const m = /\bdefault\s+([\s\S]+?)(?=\s+(?:not null|null|primary key|unique|references|generated|collate|constraint)\b|$)/.exec(s);
    return m ? clave(m[1]) : null;
}
function definirColumna(t, p) {
    const c = new RegExp(`^(${IDENTIFICADOR})\\s+([\\s\\S]+)$`).exec(p);
    if (!c) fallo('Definición de columna no reconocida. Se requiere revisión manual.');
    const col = identificador(c[1]);
    let tipo = c[2].split(/\s+(?:default|not null|null|primary key|unique|references|generated|collate|constraint)\b/)[0];
    const serial = /^(?:serial|bigserial|smallserial)$/.test(tipo);
    tipo = tipo.replace(/^serial$|^int4$|^int$/, 'integer').replace(/^bigserial$|^int8$/, 'bigint').replace(/^smallserial$|^int2$/, 'smallint').replace(/^varchar/, 'character varying').replace(/^bool$/, 'boolean').replace(/^timestamptz$/, 'timestamp with time zone');
    t.columnas[col] = { tipo: clave(tipo), nulo: !(serial || /\bnot null\b|\bprimary key\b|\bas identity\b/.test(c[2])), autogenerada: autogenerada(c[2]), defecto: valorDefecto(c[2]) };
    if (/\bprimary key\b/.test(c[2])) t.claves.push('primary key(' + col + ')');
    if (/\bunique\b/.test(c[2])) t.claves.push('unique(' + col + ')');
    const fk = new RegExp(`references\\s+(${CUALIFICADO})\\s*\\((${IDENTIFICADOR})\\)(.*)`).exec(c[2]);
    if (fk) t.claves.push(clave(`foreign key(${col}) references ${fk[1]}(${fk[2]})${fk[3]}`));
}
function leer(sql) {
    sql = sql.replace(/'(?:''|[^'])*'|--[^\r\n]*/g, m => m.startsWith("'") ? m : '');
    const tablas = {};
    for (const m of sql.matchAll(new RegExp(`CREATE TABLE\\s+(${CUALIFICADO})\\s*\\(`, 'gi'))) {
        const nombre = tablaPublica(m[1]);
        if (!TABLAS.includes(nombre)) continue;
        const t = tablas[nombre] = { columnas: {}, claves: [], indices: [] };
        for (let p of partes(parentesis(sql, m.index + m[0].length).texto)) {
            p = normalizar(p);
            if (/^(constraint|primary key|unique|foreign key|check)\b/.test(p)) {
                t.claves.push(clave(p.replace(new RegExp(`^constraint ${IDENTIFICADOR} `), ''))); continue;
            }
            definirColumna(t, p);
        }
    }
    for (const m of sql.matchAll(new RegExp(`ALTER TABLE(?: ONLY)?\\s+(${CUALIFICADO})\\s+([\\s\\S]*?);`, 'gi'))) {
        const t = tablas[tablaPublica(m[1])];
        if (!t) continue;
        const accion = normalizar(m[2]);
        const nueva = /^add column(?: if not exists)? ([\s\S]+)$/.exec(accion);
        if (nueva) definirColumna(t, nueva[1]);
        const restriccion = new RegExp(`^add constraint\\s+${IDENTIFICADOR}\\s+([\\s\\S]+)$`).exec(accion);
        if (restriccion) t.claves.push(clave(restriccion[1]));
        const cambio = new RegExp(`^alter column\\s+(${IDENTIFICADOR})\\s+([\\s\\S]+)$`).exec(accion);
        if (!cambio) continue;
        const col = t.columnas[identificador(cambio[1])];
        if (!col) continue;
        if (cambio[2] === 'set not null') col.nulo = false;
        if (cambio[2] === 'drop not null') col.nulo = true;
        if (/^set default\b/.test(cambio[2])) { col.autogenerada = autogenerada(cambio[2]); col.defecto = valorDefecto(cambio[2]); }
        if (/^add generated\b/.test(cambio[2])) { col.autogenerada = autogenerada(cambio[2]); col.nulo = false; }
        if (/^drop (?:default|identity)\b/.test(cambio[2])) { col.autogenerada = false; col.defecto = null; }
    }
    for (const m of sql.matchAll(new RegExp(`CREATE (UNIQUE )?INDEX(?: IF NOT EXISTS)?\\s+${CUALIFICADO}\\s+ON\\s+(${CUALIFICADO})\\s*(?:USING\\s+(\\w+)\\s+)?\\(`, 'gi'))) {
        const t = tablas[tablaPublica(m[2])];
        if (!t) continue;
        const cuerpo = parentesis(sql, m.index + m[0].length);
        const expr = clave(cuerpo.texto);
        const cola = clave(sql.slice(cuerpo.fin).split(';')[0]);
        const metodo = m[3] && m[3].toLowerCase() !== 'btree' ? ' using ' + m[3].toLowerCase() : '';
        // Los índices de restricciones se representan ya por su clave.
        if (m[1] && !cola && !metodo && t.claves.some(c => c === `unique(${expr})` || c === `primary key(${expr})`)) continue;
        t.indices.push((m[1] ? 'unique:' : 'index:') + expr.replace(/[()]/g, '') + metodo + (cola ? ' ' + cola : ''));
    }
    for (const t of Object.values(tablas)) {
        for (const k of t.claves) {
            const pk = /^primary key\(([^)]+)\)$/.exec(k);
            if (pk) for (const col of pk[1].split(',')) if (t.columnas[identificador(col)]) t.columnas[identificador(col)].nulo = false;
        }
        t.claves = [...new Set(t.claves)].sort(); t.indices.sort();
    }
    return tablas;
}
function comparar(sql, referencia) {
    const esperado = leer(referencia), actual = leer(sql), diferencias = [];
    for (const nombre of TABLAS) {
        const e = esperado[nombre], a = actual[nombre];
        if (!a) { diferencias.push(nombre + ': tabla ausente'); continue; }
        for (const [c, def] of Object.entries(e.columnas)) {
            if (!a.columnas[c]) diferencias.push(nombre + '.' + c + ': columna ausente');
            else {
                const col = a.columnas[c];
                if (def.tipo !== col.tipo || def.nulo !== col.nulo) diferencias.push(nombre + '.' + c + ': tipo o nulabilidad distintos (' + JSON.stringify(col) + ', esperado ' + JSON.stringify(def) + ')');
                if (!def.autogenerada && !col.autogenerada && def.defecto !== col.defecto) diferencias.push(nombre + '.' + c + ': valor DEFAULT distinto');
                if (def.autogenerada !== col.autogenerada) diferencias.push(nombre + '.' + c + ': autogeneración distinta (actual ' + col.autogenerada + ', esperada ' + def.autogenerada + ')');
            }
        }
        for (const c of Object.keys(a.columnas)) if (!e.columnas[c]) diferencias.push(nombre + '.' + c + ': columna adicional; revisar valores obligatorios en altas');
        for (const grupo of ['claves', 'indices']) {
            for (const v of e[grupo]) if (!a[grupo].includes(v)) diferencias.push(nombre + ': falta ' + grupo + ' ' + v);
            for (const v of a[grupo]) if (!e[grupo].includes(v)) diferencias.push(nombre + ': adicional ' + grupo + ' ' + v);
        }
    }
    return diferencias;
}
function referencia() { return fs.readFileSync(path.join(DB_DIR, 'esquema/001_esquema_inicial.sql'), 'utf8') + '\n' + migraciones().map(m => m.sql).join('\n'); }
function main(args) {
    if (args.length !== 1 || args[0].startsWith('--')) fallo('Uso: node scripts/comparar-esquema.js archivo-schema.sql');
    const diferencias = comparar(fs.readFileSync(args[0], 'utf8'), referencia());
    console.log('Referencia: esquema reconstruido + migraciones. Esto no valida la base real.');
    for (const d of diferencias) console.log('Diferencia: ' + d);
    if (!diferencias.length) console.log('Sin diferencias estructurales en las tablas de la aplicación.');
    console.log('Revisión manual obligatoria (pendientes.md): duplicados de números y centros, formatos históricos, unicidad de códigos/DNI, índices FK, lc_ctype y prueba de migraciones en una copia. No se comparan datos, funciones, permisos, triggers ni equivalencias semánticas de expresiones DEFAULT.');
    if (diferencias.length) process.exitCode = 2;
}
if (require.main === module) { try { main(process.argv.slice(2)); } catch (e) { terminar(e); } }
module.exports = { leer, comparar, referencia };
