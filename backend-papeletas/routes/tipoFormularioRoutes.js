const express = require('express');
const router = express.Router();
const { validateId } = require('../middlewares/idMiddleware');
router.param('id', validateId);
const tipoFormularioController = require('../controllers/tipoFormularioController');
const { verifyAdmin } = require('../middlewares/authMiddleware');

// Rutas para tipo_formulario
router.get('/', tipoFormularioController.getAllTiposFormulario);
router.get('/:id', tipoFormularioController.getTipoFormularioById);
router.post('/', verifyAdmin, tipoFormularioController.createTipoFormulario);
router.put('/:id', verifyAdmin, tipoFormularioController.updateTipoFormulario);
router.delete('/:id', verifyAdmin, tipoFormularioController.deleteTipoFormulario);

module.exports = router;
