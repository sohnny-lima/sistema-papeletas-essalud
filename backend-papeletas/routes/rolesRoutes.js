const express = require('express');
const router = express.Router();
const { validateId } = require('../middlewares/idMiddleware');
router.param('id', validateId);
const rolesController = require('../controllers/rolesController');
const { verifyAdmin } = require('../middlewares/authMiddleware');

// Rutas para roles
router.get('/', rolesController.getAllRoles);
router.get('/:id', rolesController.getRolById);
router.post('/', verifyAdmin, rolesController.createRol);
router.put('/:id', verifyAdmin, rolesController.updateRol);
router.delete('/:id', verifyAdmin, rolesController.deleteRol);

module.exports = router;
