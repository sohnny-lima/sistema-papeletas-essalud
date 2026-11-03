const express = require('express');
const router = express.Router();
const { validateId } = require('../middlewares/idMiddleware');
router.param('id', validateId);
const papeletasController = require('../controllers/papeletasController');
const { verifyAdmin } = require('../middlewares/authMiddleware');

// Rutas de papeletas
router.get('/', papeletasController.getAllPapeletas);
router.get('/:id', papeletasController.getPapeletaById);
router.post('/', papeletasController.createPapeleta);
router.put('/:id', papeletasController.updatePapeleta);
router.delete('/:id', verifyAdmin, papeletasController.deletePapeleta);

// Rutas adicionales
router.get('/trabajadores/buscar', papeletasController.searchTrabajadores);

router.get('/search/equipos', papeletasController.searchEquipos);
router.get('/last/number', papeletasController.getLastPapeletaNumber);

// Nueva ruta para obtener tipos de formulario
router.get('/tipos/formulario', papeletasController.getTiposFormulario);

module.exports = router;