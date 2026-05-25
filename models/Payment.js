// models/Payment.js
import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    // 👇 Liên kết 1-nhiều với User
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // ID giao dịch từ bên thứ 3 (VNPay, MoMo)
    transactionId: { type: String, required: true, index: true }, 
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      required: true,
    },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    method: { type: String, enum: ["vnpay", "momo", "card"], required: true },
    description: { type: String }, // "Nâng cấp lên Premium (monthly)"
    planId: { type: String }, // Gói đăng ký liên quan
    refund: {
      status: { type: String, enum: ["none", "simulated", "processed"], default: "none" },
      reason: { type: String },
      requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      requestedAt: { type: Date },
      processedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      processedAt: { type: Date },
      gatewayReference: { type: String },
    },
  },
  { timestamps: true } // `createdAt` sẽ là ngày thanh toán
);

export default mongoose.model("Payment", paymentSchema);