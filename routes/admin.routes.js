import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/roleMiddleware.js';
import upload from '../middlewares/uploadMiddleware.js';
import { audit } from '../middlewares/auditMiddleware.js';
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
  createCampaign,
  listCampaigns,
  getCampaign,
  sendCampaign,
} from '../controllers/notification.admin.controller.js';
import { previewCampaign } from '../controllers/notification.admin.controller.js';
import {
  getModerationQueue,
  hideRecipe,
  restoreRecipe,
  togglePinnedRecipe,
  toggleFeaturedRecipe,
  bulkModerateRecipes,
} from '../controllers/moderation.controller.js';
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

router.use(protect);

// Quản lý user
router.get('/users', requirePermission('users:read'), getAllUsers);
router.delete('/users/:id', requirePermission('users:delete'), audit('delete_user', 'User'), deleteUser);
router.put('/users/:id', requirePermission('users:update'), audit('update_user', 'User'), updateUser);

// Admin stats
router.get('/stats', requirePermission('dashboard:read'), getAdminStats);
router.get('/stats/revenue', requirePermission('dashboard:read'), getRevenueStats);
router.get('/stats/dashboard', requirePermission('dashboard:read'), getDashboardOverview);


// Bài viết
router.get('/posts', requirePermission('posts:read'), getAllPosts);
router.post('/posts', requirePermission('posts:create'), postUploader, createPost);
router.delete('/posts/:id', requirePermission('posts:delete'), audit('delete_post', 'Post'), deletePost);

// Bình luận
router.delete('/comments/:id', requirePermission('comments:delete'), deleteComment);

router.get('/reports', requirePermission('reports:read'), getAllReports);
router.get('/reports/overview', requirePermission('reports:read'), getReportOverview);
router.put('/reports/:id', requirePermission('reports:update'), audit('update_report', 'Report'), updateReportStatus);
router.delete('/reports/:id', requirePermission('reports:delete'), audit('delete_report', 'Report'), deleteReport);

router.get('/recipes/all', requirePermission('recipes:read'), getAllRecipesForAdmin); // <-- ROUTE MỚI
router.get('/recipes/pending', requirePermission('recipes:read'), getPendingRecipes);
router.put('/recipes/:id/approve', requirePermission('recipes:approve'), audit('approve_recipe', 'Recipe'), approveRecipe);
router.put('/recipes/:id/reject', requirePermission('recipes:reject'), audit('reject_recipe', 'Recipe'), rejectRecipe);
router.put('/recipes/approve-all', requirePermission('recipes:approve'), approveAllPendingRecipes);
router.post('/recipes/import', requirePermission('recipes:import'), audit('import_recipes', 'Recipe'), importRecipesBulk);

// Admin broadcast campaigns
router.post('/notifications/campaigns', requirePermission('notifications:send'), createCampaign);
router.get('/notifications/campaigns', requirePermission('notifications:send'), listCampaigns);
router.get('/notifications/campaigns/:id', requirePermission('notifications:send'), getCampaign);
router.post('/notifications/campaigns/:id/send', requirePermission('notifications:send'), audit('send_campaign', 'Campaign'), sendCampaign);
router.post('/notifications/campaigns/preview', requirePermission('notifications:send'), previewCampaign);

router.get('/moderation/queue', requirePermission('recipes:read'), getModerationQueue);
router.put('/moderation/recipes/:id/hide', requirePermission('recipes:moderate'), hideRecipe);
router.put('/moderation/recipes/:id/restore', requirePermission('recipes:moderate'), restoreRecipe);
router.put('/moderation/recipes/:id/pin', requirePermission('recipes:moderate'), togglePinnedRecipe);
router.put('/moderation/recipes/:id/feature', requirePermission('recipes:moderate'), toggleFeaturedRecipe);
router.post('/moderation/bulk', requirePermission('recipes:moderate'), bulkModerateRecipes);

router.get('/payments', requirePermission('payments:read'), getAdminPayments);
router.get('/payments/export', requirePermission('payments:export'), exportAdminPaymentsCsv);
router.get('/payments/:id', requirePermission('payments:read'), getAdminPaymentById);
router.post('/payments/:id/refund', requirePermission('payments:refund'), refundPayment);

export default router;
