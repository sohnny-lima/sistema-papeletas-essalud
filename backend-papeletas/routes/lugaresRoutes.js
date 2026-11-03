const express = require('express');
const router = express.Router();
const { validateId } = require('../middlewares/idMiddleware');
router.param('id', validateId);
const lugaresController = require('../controllers/lugaresController');
const { verifyAdmin } = require('../middlewares/authMiddleware');

// Rutas de lugares
router.get('/', lugaresController.getAllLugares);
router.post('/', verifyAdmin, lugaresController.createLugar);
router.put('/:id', verifyAdmin, lugaresController.updateLugar);
router.delete('/:id', verifyAdmin, lugaresController.deleteLugar);
router.get('/search', lugaresController.searchLugares); // <-- Aquí estaba el error

router.get('/:id', lugaresController.getLugarById);

module.exports = router;
