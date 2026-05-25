import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/roleMiddleware.js';
import {
  createRole,
  deleteRole,
  getAvailablePermissions,
  getRoles,
  updateRole,
} from '../controllers/role.controller.js';

const router = express.Router();

router.use(protect);

router.get('/permissions', requirePermission('roles:read'), getAvailablePermissions);
router.get('/', requirePermission('roles:read'), getRoles);
router.post('/', requirePermission('roles:create'), createRole);
router.put('/:id', requirePermission('roles:update'), updateRole);
router.delete('/:id', requirePermission('roles:delete'), deleteRole);

export default router;