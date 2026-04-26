const express = require('express');
const router = express.Router();
const lugaresController = require('../controllers/lugaresController');
const { verifyToken, verifyAdmin } = require('../middlewares/authMiddleware');

// Rutas de lugares
router.get('/', verifyToken, lugaresController.getAllLugares);
router.post('/', verifyToken, verifyAdmin, lugaresController.createLugar);
router.put('/:id', verifyToken, verifyAdmin, lugaresController.updateLugar);
router.delete('/:id', verifyToken, verifyAdmin, lugaresController.deleteLugar);
router.get('/search', verifyToken, lugaresController.searchLugares); // <-- Aquí estaba el error

module.exports = router;
