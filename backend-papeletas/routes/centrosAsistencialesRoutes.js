const express = require('express');
const router = express.Router();
const { validateId } = require('../middlewares/idMiddleware');
router.param('id', validateId);
const centrosAsistencialesController = require('../controllers/centrosAsistencialesController');
const { verifyAdmin } = require('../middlewares/authMiddleware');

// Rutas para centros asistenciales
router.get('/', centrosAsistencialesController.getAllCentros);
router.get('/:id', centrosAsistencialesController.getCentroById);
router.post('/', verifyAdmin, centrosAsistencialesController.createCentro);
router.put('/:id', verifyAdmin, centrosAsistencialesController.updateCentro);
router.delete('/:id', verifyAdmin, centrosAsistencialesController.deleteCentro);

module.exports = router;
