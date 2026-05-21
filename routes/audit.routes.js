import express from 'express';
import { protect, isAdmin } from '../middlewares/authMiddleware.js';
import { queryAudits } from '../controllers/audit.controller.js';

const router = express.Router();

router.use(protect, isAdmin);

// GET /api/admin/audits
import { exportAudits } from '../controllers/audit.controller.js';
router.get('/export', exportAudits);
router.get('/', queryAudits);

export default router;
