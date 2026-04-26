const express = require('express');
const router = express.Router();
const trabajadoresController = require('../controllers/trabajadoresController');
const { verifyToken, verifyAdmin } = require('../middlewares/authMiddleware');

// Rutas de trabajadores
router.get('/', verifyToken, trabajadoresController.getAllTrabajadores);
router.get('/:id', verifyToken, trabajadoresController.getTrabajadorById);
router.post('/', verifyToken, trabajadoresController.createTrabajador);
router.put('/:id', verifyToken, trabajadoresController.updateTrabajador);
router.delete('/:id', verifyToken, verifyAdmin, trabajadoresController.deleteTrabajador);

module.exports = router;
