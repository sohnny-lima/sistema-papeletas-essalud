const express = require('express');
const router = express.Router();
const tipoFormularioController = require('../controllers/tipoFormularioController');
const { verifyToken, verifyAdmin } = require('../middlewares/authMiddleware');

// Rutas para tipo_formulario
router.get('/', verifyToken, tipoFormularioController.getAllTiposFormulario);
router.get('/:id', verifyToken, tipoFormularioController.getTipoFormularioById);
router.post('/', verifyToken, verifyAdmin, tipoFormularioController.createTipoFormulario);
router.put('/:id', verifyToken, verifyAdmin, tipoFormularioController.updateTipoFormulario);
router.delete('/:id', verifyToken, verifyAdmin, tipoFormularioController.deleteTipoFormulario);

module.exports = router;
