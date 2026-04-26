const express = require('express');
const router = express.Router();
const equiposController = require('../controllers/equiposController');
const { verifyToken, verifyAdmin } = require('../middlewares/authMiddleware');

// Rutas
router.get('/', verifyToken, equiposController.getAllEquipos);
router.get('/:id', verifyToken, equiposController.getEquipoById);
router.post('/', verifyToken, equiposController.createEquipo);
router.put('/:id', verifyToken, equiposController.updateEquipo);
router.delete('/:id', verifyToken, verifyAdmin, equiposController.deleteEquipo);

module.exports = router;
