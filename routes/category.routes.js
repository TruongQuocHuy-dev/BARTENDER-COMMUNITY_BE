// routes/categoryRoutes.js
import express from 'express';
import {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory
} from '../controllers/category.controller.js';
import upload from '../middlewares/uploadMiddleware.js';
import { protect } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/roleMiddleware.js';

const router = express.Router();

router.get('/', getAllCategories);
router.get('/:id', getCategoryById);

// Secure create/update/delete to authorized admins
router.post('/', protect, requirePermission('categories:manage'), upload.single('image'), createCategory);
router.put('/:id', protect, requirePermission('categories:manage'), upload.single('image'), updateCategory);
router.delete('/:id', protect, requirePermission('categories:manage'), deleteCategory);

export default router;
