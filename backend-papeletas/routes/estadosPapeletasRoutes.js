const express = require('express');
const router = express.Router();
const estadosPapeletasController = require('../controllers/estadosPapeletasController');
const { verifyToken, verifyAdmin } = require('../middlewares/authMiddleware');

// Rutas para estados de papeletas
router.get('/', verifyToken, estadosPapeletasController.getAllEstados);
router.get('/:id', verifyToken, estadosPapeletasController.getEstadoById);
router.post('/', verifyToken, verifyAdmin, estadosPapeletasController.createEstado);
router.put('/:id', verifyToken, verifyAdmin, estadosPapeletasController.updateEstado);
router.delete('/:id', verifyToken, verifyAdmin, estadosPapeletasController.deleteEstado);

module.exports = router;
