// Thay thế toàn bộ file payment.routes.js bằng code này

import express from "express";
import {
  getMyPaymentHistory,
  createPayment,
  handleVnpayReturn,
  handleVnpayIpn,
  handleMomoIpn,
} from "../controllers/payment.controller.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/vnpay_return", handleVnpayReturn);
router.get("/vnpay_ipn", handleVnpayIpn); // Hoặc /ipn/vnpay tùy config trên VNPay Sandbox

// Webhook MoMo gọi ngầm báo kết quả (Bắt buộc phải Public)
router.post("/ipn/momo", handleMomoIpn);
console.log("====== TEST v5: Đang đăng ký route / (PRIVATE) =====");
router.get("/", protect, getMyPaymentHistory);
router.post("/", protect, createPayment);

export default router;
