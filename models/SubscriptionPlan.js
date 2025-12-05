// models/SubscriptionPlan.js
import mongoose from "mongoose";

const planSchema = new mongoose.Schema({
  // Dùng làm ID (ví dụ: "premium-monthly")
  planId: { type: String, required: true, unique: true }, 
  tier: { type: String, enum: ["free", "premium"], required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  currency: { type: String, required: true, default: "USD" },
  billingCycle: { type: String, enum: ["monthly", "yearly"], required: true },
  features: [{ type: String }],
  popularPlan: { type: Boolean, default: false },
});

export default mongoose.model("SubscriptionPlan", planSchema);