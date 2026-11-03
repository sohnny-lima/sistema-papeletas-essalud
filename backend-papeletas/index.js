// index.js: arranque del servidor
require('dotenv').config();
const { logError } = require('./utils/securityLog');
const { checkEnv } = require('./config/env');

const { errors, warnings } = checkEnv();
warnings.forEach((w) => console.warn(`⚠️  ${w}`));
if (errors.length > 0) {
    errors.forEach((e) => console.error(`❌ Configuración inválida: ${e}`));
    process.exit(1);
}

const app = require('./app');
const pool = require('./config/database');

// Última red de seguridad: una promesa rechazada sin capturar no debe tumbar el servidor.
process.on('unhandledRejection', (reason) => {
    logError('Promesa rechazada sin capturar', reason);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
    // Aviso temprano si la base de datos no responde; el servidor sigue en marcha
    // y responderá 503 hasta que PostgreSQL esté disponible.
    pool.checkConnection().then((ok) => {
        if (ok) console.log('🟢 Conexión con la base de datos verificada');
    });
});
