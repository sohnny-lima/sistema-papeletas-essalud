const { Pool } = require('pg');
require('dotenv').config(); // Carga las variables de entorno desde el archivo .env

// Configuración de la conexión
const pool = new Pool({
    user: process.env.DB_USER || 'postgres', // Valor por defecto si no se encuentra en el archivo .env
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'bd_papeleta',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
});

// Eventos de la conexión
pool.on('connect', () => {
    console.log('🟢 Conexión exitosa a la base de datos');
});

pool.on('error', (err) => {
    console.error('🔴 Error en la conexión con la base de datos:', err.message);
    process.exit(-1); // Finaliza el proceso si hay un error crítico
});

module.exports = pool;
