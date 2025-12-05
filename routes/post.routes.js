import express from 'express';
import {
  createPost,
  getAllPosts,
  getPostById,
  updatePost,
  deletePost,
  getPostsByUser,
  likePost
} from '../controllers/post.controller.js';
import { protect, optionalAuth } from '../middlewares/authMiddleware.js';
import upload from '../middlewares/uploadMiddleware.js';

const router = express.Router();

// Middleware upload (xử lý image/video)
const uploader = upload.fields([
  { name: 'imageFile', maxCount: 1 }, 
    { name: 'videoFile', maxCount: 1 }
]);

// === CÁC ROUTES TUÂN THỦ REST ===

// 1. GET /posts (Lấy tất cả)
// 2. POST /posts (Tạo mới)
router.route('/posts')
  .get(optionalAuth, getAllPosts) // Không cần 'protect' nếu post là public
  .post(protect, uploader, createPost); // Cần 'protect' và 'uploader'

// 3. GET /posts/:postId (Lấy chi tiết)
// 4. PATCH /posts/:postId (Cập nhật)
// 5. DELETE /posts/:postId (Xóa)
router.route('/posts/:postId')
  .get(optionalAuth, getPostById) // Không cần 'protect' nếu post là public
  .patch(protect, uploader, updatePost) // Cần 'protect' và 'uploader'
  .delete(protect, deletePost); // Cần 'protect'

// 6. GET /users/:userId/posts (Lấy post theo user)
// (Route này thể hiện sự phân cấp: posts là con của users)
router.get('/users/:userId/posts', optionalAuth, getPostsByUser); 
// Không cần 'protect' nếu profile user là public

// (Bạn cũng cần thêm route cho Like, Report, Comment)
// Ví dụ:
// import { likePost } from '../controllers/likeController.js';
router.post('/posts/:postId/likes', protect, likePost);
// (Dùng danh từ /likes, không dùng động từ /like)

export default router;