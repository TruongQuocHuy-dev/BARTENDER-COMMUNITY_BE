import express from "express";
import {
  getAllComments,
  getCommentsForPost,
  createComment,
  likeComment,
  updateComment,
  deleteComment,
} from "../controllers/comment.controller.js"; // Đảm bảo tên file controller đúng
import { protect, optionalAuth } from "../middlewares/authMiddleware.js";
import upload from "../middlewares/uploadMiddleware.js"; // <-- Import gốc

const router = express.Router();

// --- SỬA: Đổi tên biến middleware upload ---
// Middleware upload chỉ cho ảnh
const imageUploader = upload.fields([{ name: "image", maxCount: 1 }]);
// ----------------------------------------

// === CÁC ROUTES CHO COMMENT ===

// 1. Lấy comments của một post
// GET /api/posts/:postId/comments
// --- SỬA: Bỏ middleware 'upload' khỏi route GET ---
router.get('/posts/:postId/comments', optionalAuth, getCommentsForPost);
// ---------------------------------------------

// 2. Tạo comment mới cho một post
// POST /api/posts/:postId/comments
// --- SỬA: Dùng 'imageUploader' ---
router.post("/posts/:postId/comments", protect, imageUploader, createComment);
// ------------------------------

// 3. Like/Unlike một comment cụ thể
// POST /api/comments/:commentId/likes
router.post("/comments/:commentId/likes", protect, likeComment); // Route này không cần upload

// 4. Cập nhật comment (chỉ sửa text, không cần upload)
router.patch("/comments/:commentId", protect, updateComment);

// 5. Xóa comment
router.delete("/comments/:commentId", protect, deleteComment);

router.get('/comments', optionalAuth, getAllComments);

export default router;
