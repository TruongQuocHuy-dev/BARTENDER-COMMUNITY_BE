import express from 'express';
import { protect, isAdmin } from '../middlewares/authMiddleware.js';
import upload from '../middlewares/uploadMiddleware.js';
import {
  listSettings,
  getSetting,
  upsertSetting,
  deleteSetting,
} from '../controllers/system.controller.js';

const router = express.Router();

router.use(protect, isAdmin);
router.get('/', listSettings);
router.get('/:key', getSetting);
router.put('/:key', upsertSetting);
router.post('/', upsertSetting);
router.delete('/:key', deleteSetting);

export default router;
