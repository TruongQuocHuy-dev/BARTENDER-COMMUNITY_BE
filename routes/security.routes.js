// routes/security.routes.js
import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import {
  getDevices,
  // ❌ getLoginHistory, // Đã xoá
  getSecuritySettings,
  logoutDevice,
  updateSecuritySettings,
  registerCurrentDevice,
  logoutAllDevices,
  changePassword,
} from "../controllers/security.controller.js";

import {
  generateAppSecret,
  sendSmsCode,
  verifyAndEnable,
  disable,
} from "../controllers/twoFactor.controller.js";

const router = express.Router();

// Security settings
router.get("/", protect, getSecuritySettings);
router.put("/", protect, updateSecuritySettings);

// Devices
router.get("/devices", protect, getDevices);
router.delete("/devices/:deviceId", protect, logoutDevice);
router.post("/devices/logout-all", protect, logoutAllDevices);
router.post("/devices", protect, registerCurrentDevice);

router.post("/2fa/generate-secret", protect, generateAppSecret);
router.post("/2fa/send-sms", protect, sendSmsCode);
router.post("/2fa/verify-and-enable", protect, verifyAndEnable);
router.post("/2fa/disable", protect, disable); // Dùng POST (an toàn hơn)
router.put("/change-password", protect, changePassword);

export default router;
