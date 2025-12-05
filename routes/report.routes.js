import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import { 
  blockUser, 
  reportPost, 
  restrictUser, 
  markPostAsNotInterested, 
  reportComment,
  sendSupportRequest
} from '../controllers/report.controller.js';

const router = express.Router();

// Tất cả các route này yêu cầu đăng nhập
router.use(protect);

// Chặn/Bỏ chặn (Toggle)
router.post('/users/:userId/block', blockUser);

// Hạn chế (Thêm vào danh sách)
router.post('/users/:userId/restrict', restrictUser);

// Báo cáo bài viết
router.post('/posts/:postId/report', reportPost);
router.post('/comments/:commentId/report', reportComment);

// Không quan tâm
router.post('/posts/:postId/not-interested', markPostAsNotInterested);
router.post('/reports/support', sendSupportRequest);

export default router;