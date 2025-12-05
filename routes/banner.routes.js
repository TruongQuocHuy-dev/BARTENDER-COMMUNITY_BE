import express from 'express';
import { 
  createBanner, 
  getAllBanners, 
  deleteBanner, 
  getBannerById,
  updateBanner 
} from '../controllers/banner.controller.js';
import { protect, isAdmin } from '../middlewares/authMiddleware.js';
import upload from '../middlewares/uploadMiddleware.js';

const router = express.Router();

// Public routes
router.get('/', getAllBanners);
router.get('/:id', getBannerById);

// Admin routes
router.post('/', 
  protect, 
  isAdmin, 
  upload.single('image'), 
  createBanner
);

router.put('/:id', 
  protect, 
  isAdmin, 
  upload.single('image'), 
  updateBanner
);

router.delete('/:id', 
  protect, 
  isAdmin, 
  deleteBanner
);

export default router;
