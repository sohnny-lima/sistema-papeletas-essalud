const express = require('express');
const router = express.Router();
const papeletaEquiposController = require('../controllers/papeletaEquiposController');
const { verifyToken, verifyAdmin } = require('../middlewares/authMiddleware');

// Rutas para papeleta_equipos
router.get('/', verifyToken, papeletaEquiposController.getAllPapeletaEquipos);
router.get('/:id', verifyToken, papeletaEquiposController.getPapeletaEquipoById);
router.post('/', verifyToken, verifyAdmin, papeletaEquiposController.createPapeletaEquipo);
router.put('/:id', verifyToken, verifyAdmin, papeletaEquiposController.updatePapeletaEquipo);
router.delete('/:id', verifyToken, verifyAdmin, papeletaEquiposController.deletePapeletaEquipo);

module.exports = router;
