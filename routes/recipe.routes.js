// routes/recipeRoutes.js
import express from 'express';
import {
  getAllRecipes,
  getRecipeById,
  createRecipe,
  updateRecipe,
  deleteRecipe,
  toggleFavorite,
  getUserFavorites,
  getRecipesByUser,
  searchRecipes,
  searchByImage
} from '../controllers/recipe.controller.js';

import { protect } from '../middlewares/authMiddleware.js';
import upload from '../middlewares/uploadMiddleware.js';

const router = express.Router();

// Routes đọc dữ liệu (public)
router.get('/', getAllRecipes);
router.get("/search", searchRecipes);
router.post(
  "/search/image", 
  upload.single('image'), // Dùng upload middleware (tên field là 'image')
  searchByImage // Hàm controller mới
);

// Favorites trước :id
router.get('/favorites', protect, getUserFavorites);

router.get('/:id', getRecipeById);

router.get('/users/:userId/recipes', getRecipesByUser);

// CRUD
router.post('/', protect, upload.fields([
  { name: 'imageFile', maxCount: 1 },
  { name: 'videoFile', maxCount: 1 }
]), createRecipe);
router.put('/:id', protect, upload.fields([
  { name: 'imageFile', maxCount: 1 },
  { name: 'videoFile', maxCount: 1 }
]), updateRecipe);
router.delete('/:id', deleteRecipe);

// Toggle favorite
router.post('/:id/favorite', protect, toggleFavorite);

export default router;