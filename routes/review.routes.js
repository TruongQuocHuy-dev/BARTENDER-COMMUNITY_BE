import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import {
  getReviewsByRecipeId,
  createReview,
  updateReview,
  deleteReview,
  toggleHelpfulReview,
} from '../controllers/review.controller.js';
import jwt from 'jsonwebtoken'; // 🟢 Import thêm để decode tay
import User from '../models/User.js';

const router = express.Router();

const optionalAuth = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // 🟢 SỬA Ở ĐÂY: Dùng decoded.userId thay vì decoded.id
      // (Thêm || decoded.id để dự phòng nếu token thay đổi cấu trúc)
      req.user = await User.findById(decoded.userId || decoded.id).select('-password');
      
    } catch (error) {
      console.error("Optional Auth Error:", error.message);
    }
  }
  next();
};

// 👇 SỬA DÒNG NÀY: Thêm optionalAuth vào trước
router.get('/:recipeId', optionalAuth, getReviewsByRecipeId);


// protected
router.post('/', protect, createReview);
router.put('/:id', protect, updateReview);
router.delete('/:id', protect, deleteReview);
router.patch('/:id/helpful', protect, toggleHelpfulReview);

export default router;
