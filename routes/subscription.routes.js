// routes/subscriptionRoutes.js
import express from "express";
import { 
  getMySubscription, 
  cancelMySubscription 
} from "../controllers/subscription.controller.js";
import { protect } from "../middlewares/authMiddleware.js"; // BẮT BUỘC dùng 'protect'

const router = express.Router();

// Tất cả các route trong file này đều yêu cầu đăng nhập
router.use(protect);

// GET /api/v1/me/subscription
router.get("/", getMySubscription);

// DELETE /api/v1/me/subscription
// Dùng cho chức năng "Hạ cấp" (handleDowngrade) trong SubscriptionScreen.tsx
router.delete("/", cancelMySubscription);

export default router;