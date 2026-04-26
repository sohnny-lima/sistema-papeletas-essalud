const express = require('express');
const router = express.Router();
const usuariosController = require('../controllers/usuariosController');
const { verifyToken, verifyAdmin } = require('../middlewares/authMiddleware');

// Rutas para usuarios
router.get('/', verifyToken, verifyAdmin, usuariosController.getAllUsuarios);
router.get('/:id', verifyToken, verifyAdmin, usuariosController.getUsuarioById);
router.post('/', verifyToken, verifyAdmin, usuariosController.createUsuario);
router.put('/:id', verifyToken, verifyAdmin, usuariosController.updateUsuario);
router.delete('/:id', verifyToken, verifyAdmin, usuariosController.deleteUsuario);

module.exports = router;
