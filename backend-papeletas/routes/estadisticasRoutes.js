const express = require('express');
const router = express.Router();
const { validateId } = require('../middlewares/idMiddleware');
router.param('id', validateId);
const estadisticasController = require('../controllers/estadisticasController');

// Ruta para obtener estadísticas generales
router.get('/', estadisticasController.getEstadisticas);

module.exports = router;
