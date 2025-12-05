import express from "express";
import { deleteActivity, getActivities, markAllAsRead, markOneAsRead } from "../controllers/activity.controller.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Định nghĩa route cho GET /api/activities
// Yêu cầu xác thực (authMiddleware) trước khi chạy getActivities
router.get("/", protect, getActivities);
router.patch("/:id/read", protect, markOneAsRead);
router.delete("/:id", protect, deleteActivity);
router.post("/mark-read", protect, markAllAsRead);

export default router;