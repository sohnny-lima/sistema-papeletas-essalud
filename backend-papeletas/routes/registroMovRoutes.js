const express = require('express');
const router = express.Router();
const { validateId } = require('../middlewares/idMiddleware');
router.param('id', validateId);
const registroMovController = require('../controllers/registroMovController');

// Rutas de registro de movimientos
router.get('/', registroMovController.getAllMovimientos);
router.get('/filtro', registroMovController.getFilteredMovimientos);
router.get('/:id', registroMovController.getMovimientoById);

module.exports = router;
