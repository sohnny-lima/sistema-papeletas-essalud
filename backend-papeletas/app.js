// app.js: definición de la aplicación Express (sin arrancar el servidor)
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { trustProxy } = require('./config/env');
const { accessLog } = require('./middlewares/accessLog');
const { auditWrites } = require('./middlewares/auditMiddleware');
const { errorHandler } = require('./utils/responseHandler');

// Middlewares personalizados
const { verifyToken } = require('./middlewares/authMiddleware');

// Rutas
const authRoutes = require('./routes/authRoutes');
const papeletasRoutes = require('./routes/papeletasRoutes');
const trabajadoresRoutes = require('./routes/trabajadoresRoutes');
const equiposRoutes = require('./routes/equiposRoutes');
const lugaresRoutes = require('./routes/lugaresRoutes');
const registroMovRoutes = require('./routes/registroMovRoutes');
const estadisticasRoutes = require('./routes/estadisticasRoutes');
const centrosAsistencialesRoutes = require('./routes/centrosAsistencialesRoutes');
const estadosPapeletasRoutes = require('./routes/estadosPapeletasRoutes');
const papeletaEquiposRoutes = require('./routes/papeletaEquiposRoutes');
const rolesRoutes = require('./routes/rolesRoutes');
const tipoFormularioRoutes = require('./routes/tipoFormularioRoutes');
const usuariosRoutes = require('./routes/usuariosRoutes');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', trustProxy());
app.use(accessLog);
app.use(helmet());

// Configuración del Middleware
if (process.env.CLIENT_URL) app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(auditWrites);
app.use(express.json({ limit: '100kb' }));

// Ruta raíz
app.get('/', (req, res) => {
    res.send('Bienvenido al Servidor de API de Papeletas. Usa las rutas de la API para interactuar.');
});

// Rutas públicas
app.use('/api/salud', require('./routes/saludRoutes'));
app.use('/api/auth', authRoutes);

// Rutas protegidas
app.use('/api/papeletas', verifyToken, papeletasRoutes);
app.use('/api/trabajadores', verifyToken, trabajadoresRoutes);
app.use('/api/equipos', verifyToken, equiposRoutes);
app.use('/api/lugares', verifyToken, lugaresRoutes);
app.use('/api/registro_movimientos', verifyToken, registroMovRoutes);
app.use('/api/estadisticas', verifyToken, estadisticasRoutes);
app.use('/api/centros_asistenciales', verifyToken, centrosAsistencialesRoutes);
app.use('/api/estados_papeletas', verifyToken, estadosPapeletasRoutes);
app.use('/api/papeleta_equipos', verifyToken, papeletaEquiposRoutes);
app.use('/api/roles', verifyToken, rolesRoutes);
app.use('/api/tipo_formulario', verifyToken, tipoFormularioRoutes);
app.use('/api/usuarios', verifyToken, usuariosRoutes);

// Middleware para manejo de errores no controlados
app.use(errorHandler);

module.exports = app;
