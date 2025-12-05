import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import { getNotificationSettings, updateNotificationSettings } from '../controllers/notification.controller.js';

const router = express.Router();

// Thêm 'protect' để đảm bảo user đã đăng nhập
router.get('/notifications', protect, getNotificationSettings);
router.put('/notifications', protect, updateNotificationSettings);

export default router;