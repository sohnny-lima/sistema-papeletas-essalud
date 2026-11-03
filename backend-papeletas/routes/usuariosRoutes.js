const express = require('express');
const router = express.Router();
const { validateId } = require('../middlewares/idMiddleware');
const usuariosController = require('../controllers/usuariosController');
const { verifyAdmin } = require('../middlewares/authMiddleware');

// U2: la autorización precede incluso a router.param.
router.use(verifyAdmin);
router.param('id', validateId);
router.get('/politica-contrasena', usuariosController.getPoliticaContrasena);
router.patch('/:id/estado', usuariosController.cambiarEstado);

// Rutas para usuarios
router.get('/', usuariosController.getAllUsuarios);
router.get('/:id', usuariosController.getUsuarioById);
router.post('/', usuariosController.createUsuario);
router.put('/:id', usuariosController.updateUsuario);
router.delete('/:id', usuariosController.deleteUsuario);

module.exports = router;
