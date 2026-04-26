const express = require('express');
const router = express.Router();
const centrosAsistencialesController = require('../controllers/centrosAsistencialesController');
const { verifyToken, verifyAdmin } = require('../middlewares/authMiddleware');

// Rutas para centros asistenciales
router.get('/', verifyToken, centrosAsistencialesController.getAllCentros);
router.get('/:id', verifyToken, centrosAsistencialesController.getCentroById);
router.post('/', verifyToken, verifyAdmin, centrosAsistencialesController.createCentro);
router.put('/:id', verifyToken, verifyAdmin, centrosAsistencialesController.updateCentro);
router.delete('/:id', verifyToken, verifyAdmin, centrosAsistencialesController.deleteCentro);

module.exports = router;
