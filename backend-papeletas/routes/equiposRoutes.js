const express = require('express');
const router = express.Router();
const { validateId } = require('../middlewares/idMiddleware');
router.param('id', validateId);
const equiposController = require('../controllers/equiposController');
const { verifyAdmin } = require('../middlewares/authMiddleware');

// Rutas
router.get('/', equiposController.getAllEquipos);
router.get('/:id', equiposController.getEquipoById);
router.post('/', equiposController.createEquipo);
router.put('/:id', equiposController.updateEquipo);
router.delete('/:id', verifyAdmin, equiposController.deleteEquipo);

module.exports = router;
