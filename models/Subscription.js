// models/Subscription.js
import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema(
  {
    // 👇 Liên kết 1-1 với User (và không thêm trường nào vào User)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // Đảm bảo mỗi user chỉ có 1 subscription
    },
    planId: { type: String, required: true }, // "free", "premium-monthly"
    tier: { type: String, enum: ["free", "premium"], required: true },
    startDate: { type: Date },
    endDate: { type: Date }, // Ngày hết hạn/gia hạn
    autoRenew: { type: Boolean, default: true },
    price: { type: Number, required: true },
    currency: { type: String, required: true },
    // ID của giao dịch gần nhất
    lastPaymentId: { type: String }, 
  },
  { timestamps: true }
);

export default mongoose.model("Subscription", subscriptionSchema);