const express = require('express');
const router = express.Router();
const rolesController = require('../controllers/rolesController');
const { verifyToken, verifyAdmin } = require('../middlewares/authMiddleware');

// Rutas para roles
router.get('/', verifyToken, rolesController.getAllRoles);
router.get('/:id', verifyToken, rolesController.getRolById);
router.post('/', verifyToken, verifyAdmin, rolesController.createRol);
router.put('/:id', verifyToken, verifyAdmin, rolesController.updateRol);
router.delete('/:id', verifyToken, verifyAdmin, rolesController.deleteRol);

module.exports = router;
