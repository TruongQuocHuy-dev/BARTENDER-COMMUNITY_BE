// routes/paymentMethodRoutes.js
import express from "express";
import {
  getMyPaymentMethods,
  addPaymentMethod,
  removePaymentMethod,
  setDefaultPaymentMethod,
} from "../controllers/payment-method.controller.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Tất cả các route này đều yêu cầu đăng nhập
router.use(protect);

router.route("/")
  .get(getMyPaymentMethods)   // Lấy danh sách PTTT
  .post(addPaymentMethod);    // Thêm PTTT mới

router.route("/:id")
  .delete(removePaymentMethod); // Xóa PTTT

router.route("/:id/default")
  .patch(setDefaultPaymentMethod); // Đặt làm mặc định

export default router;