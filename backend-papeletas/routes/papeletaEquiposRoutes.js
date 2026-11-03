const express = require('express');
const router = express.Router();
const { validateId } = require('../middlewares/idMiddleware');
router.param('id', validateId);
const papeletaEquiposController = require('../controllers/papeletaEquiposController');
const { verifyAdmin } = require('../middlewares/authMiddleware');

// Rutas para papeleta_equipos
router.get('/', papeletaEquiposController.getAllPapeletaEquipos);
router.get('/:id', papeletaEquiposController.getPapeletaEquipoById);
router.post('/', verifyAdmin, papeletaEquiposController.createPapeletaEquipo);
router.put('/:id', verifyAdmin, papeletaEquiposController.updatePapeletaEquipo);
router.delete('/:id', verifyAdmin, papeletaEquiposController.deletePapeletaEquipo);

module.exports = router;
