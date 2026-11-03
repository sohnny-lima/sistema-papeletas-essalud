const express = require('express');
const { verifyToken } = require('../middlewares/authMiddleware');
const authController = require('../controllers/authController');

const { rateLimit } = require('express-rate-limit');
const router = express.Router();
const limiteLogin = rateLimit({
    windowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 900000),
    limit: Number(process.env.LOGIN_RATE_LIMIT_MAX || 10),
    // Solo cuentan los intentos fallidos: varios usuarios pueden compartir IP (NAT o proxy de la institución).
    skipSuccessfulRequests: true,
    // Un fallo del servicio no consume los intentos del cliente. Los 400/401 sí cuentan.
    requestWasSuccessful: (req, res) => res.statusCode < 400 || res.statusCode >= 500,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { success: false, message: 'Demasiados intentos. Espere unos minutos.' },
});

// Ruta para iniciar sesión
router.post('/login', limiteLogin, authController.login);

router.get('/sesion', verifyToken, authController.sesion);

// Exportar el enrutador
module.exports = router;
