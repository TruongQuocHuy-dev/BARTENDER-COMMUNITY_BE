import express from 'express';
import { protect, isAdmin } from '../middlewares/authMiddleware.js';
import {
  getAllUsers,
  deleteUser,
  deletePost,
  getAllPosts,
  deleteComment,
  updateUser,
  getAdminStats,
  getRevenueStats,
  getAllReports,
  getReportOverview,
  updateReportStatus,
  deleteReport,
  getPendingRecipes,
  approveRecipe,
  rejectRecipe,
  getAllRecipesForAdmin,
  approveAllPendingRecipes,
  importRecipesBulk
} from '../controllers/admin.controller.js';

const router = express.Router();

router.use(protect, isAdmin);

// Quản lý user
router.get('/users', getAllUsers);
router.delete('/users/:id', deleteUser);
router.put('/users/:id', updateUser);

// Admin stats
router.get('/stats', getAdminStats);
router.get('/stats/revenue', getRevenueStats);


// Bài viết
router.get('/posts', getAllPosts);
router.delete('/posts/:id', deletePost);

// Bình luận
router.delete('/comments/:id', deleteComment);

router.get('/reports', getAllReports);
router.get('/reports/overview', getReportOverview);
router.put('/reports/:id', updateReportStatus);
router.delete('/reports/:id', deleteReport);

router.get('/recipes/all', getAllRecipesForAdmin); // <-- ROUTE MỚI
router.get('/recipes/pending', getPendingRecipes);
router.put('/recipes/:id/approve', approveRecipe);
router.put('/recipes/:id/reject', rejectRecipe);
router.put('/recipes/approve-all', approveAllPendingRecipes);
router.post('/recipes/import', importRecipesBulk);

export default router;
