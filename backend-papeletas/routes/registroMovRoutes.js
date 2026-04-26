const express = require('express');
const router = express.Router();
const registroMovController = require('../controllers/registroMovController');
const { verifyToken } = require('../middlewares/authMiddleware');

// Rutas de registro de movimientos
router.get('/', verifyToken, registroMovController.getAllMovimientos);
router.get('/filtro', verifyToken, registroMovController.getFilteredMovimientos);
router.get('/:id', verifyToken, registroMovController.getMovimientoById);

module.exports = router;
