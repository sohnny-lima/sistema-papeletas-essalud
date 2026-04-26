const express = require('express');
const router = express.Router();
const papeletasController = require('../controllers/papeletasController');
const { verifyToken, verifyAdmin } = require('../middlewares/authMiddleware');

// Rutas de papeletas
router.get('/', verifyToken, papeletasController.getAllPapeletas);
router.get('/:id', verifyToken, papeletasController.getPapeletaById);
router.post('/', verifyToken, papeletasController.createPapeleta);
router.put('/:id', verifyToken, papeletasController.updatePapeleta);
router.delete('/:id', verifyToken, verifyAdmin, papeletasController.deletePapeleta);

// Rutas adicionales
router.get('/trabajadores/buscar', verifyToken, papeletasController.searchTrabajadores);

router.get('/search/equipos', verifyToken, papeletasController.searchEquipos);
router.get('/last/number', verifyToken, papeletasController.getLastPapeletaNumber);

// Nueva ruta para obtener tipos de formulario
router.get('/tipos/formulario', verifyToken, papeletasController.getTiposFormulario);

module.exports = router;