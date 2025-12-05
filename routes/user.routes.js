// routes/userRoutes.js
import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import upload from '../middlewares/uploadMiddleware.js';
import { getMyFavoriteRecipes, getRecipesByUser } from '../controllers/recipe.controller.js';
import { 
    updateUserProfile, 
    getUserProfile,   // Hàm công khai (lấy req.params.userId)
    getMyProfile,     // Hàm cá nhân (lấy req.user._id)
    saveDeviceInfo, 
    getUserStats,
    followUser,
    unfollowUser,
    getBlockedUsersList,
} from '../controllers/user.controller.js';

const router = express.Router();

// --- SỬA 2: CÁC ROUTE CÁ NHÂN DÙNG '/me' ---
// Các route này dành riêng cho user đã đăng nhập (lấy từ token)
router.get('/me', protect, getMyProfile); // <-- Đổi thành getMyProfile
router.put('/me', protect, upload.single('avatar'), updateUserProfile);
router.get('/me/stats', protect, getUserStats);
router.post('/device', protect, saveDeviceInfo);

router.get('/blocked', protect, getBlockedUsersList);
router.get('/:userId/recipes', getRecipesByUser);
router.get('/me/favorites/recipes', protect, getMyFavoriteRecipes);

router.post('/:userId/follow', protect, followUser);
router.delete('/:userId/follow', protect, unfollowUser);
router.get('/:userId', getUserProfile);

export default router;