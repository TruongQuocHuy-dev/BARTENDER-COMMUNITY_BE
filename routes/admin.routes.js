import express from 'express';
import { protect, isAdmin } from '../middlewares/authMiddleware.js';
import upload from '../middlewares/uploadMiddleware.js';
import {
  getAllUsers,
  deleteUser,
  deletePost,
  getAllPosts,
  createPost,
  deleteComment,
  updateUser,
  getAdminStats,
  getRevenueStats,
  getDashboardOverview,
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
import {
  getAdminPayments,
  getAdminPaymentById,
  refundPayment,
  exportAdminPaymentsCsv,
} from '../controllers/payment.admin.controller.js';

const router = express.Router();
const postUploader = upload.fields([
  { name: 'imageFile', maxCount: 1 },
  { name: 'videoFile', maxCount: 1 },
]);

router.use(protect, isAdmin);

// Quản lý user
router.get('/users', getAllUsers);
router.delete('/users/:id', deleteUser);
router.put('/users/:id', updateUser);

// Admin stats
router.get('/stats', getAdminStats);
router.get('/stats/revenue', getRevenueStats);
router.get('/stats/dashboard', getDashboardOverview);


// Bài viết
router.get('/posts', getAllPosts);
router.post('/posts', postUploader, createPost);
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

router.get('/payments', getAdminPayments);
router.get('/payments/export', exportAdminPaymentsCsv);
router.get('/payments/:id', getAdminPaymentById);
router.post('/payments/:id/refund', refundPayment);

export default router;
