const express = require('express');
const router = express.Router();
const { validateId } = require('../middlewares/idMiddleware');
router.param('id', validateId);
const trabajadoresController = require('../controllers/trabajadoresController');
const { verifyAdmin } = require('../middlewares/authMiddleware');

// Rutas de trabajadores
router.get('/', trabajadoresController.getAllTrabajadores);
router.get('/:id', trabajadoresController.getTrabajadorById);
router.post('/', trabajadoresController.createTrabajador);
router.put('/:id', trabajadoresController.updateTrabajador);
router.delete('/:id', verifyAdmin, trabajadoresController.deleteTrabajador);

module.exports = router;
