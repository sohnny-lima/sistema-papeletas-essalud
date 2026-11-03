const express = require('express');
const router = express.Router();
const { validateId } = require('../middlewares/idMiddleware');
router.param('id', validateId);
const estadosPapeletasController = require('../controllers/estadosPapeletasController');
const { verifyAdmin } = require('../middlewares/authMiddleware');

// Rutas para estados de papeletas
router.get('/', estadosPapeletasController.getAllEstados);
router.get('/:id', estadosPapeletasController.getEstadoById);
router.post('/', verifyAdmin, estadosPapeletasController.createEstado);
router.put('/:id', verifyAdmin, estadosPapeletasController.updateEstado);
router.delete('/:id', verifyAdmin, estadosPapeletasController.deleteEstado);

module.exports = router;
