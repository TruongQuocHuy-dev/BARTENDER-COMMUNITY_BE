// models/Securitys.js
import mongoose from "mongoose";

const securitySchema = new mongoose.Schema(
  {
    // Liên kết 1-1 với User
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    }, // === Cài đặt 2FA ===

    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorMethod: {
      type: String,
      enum: ["app", "sms", null],
      default: null,
    },
    twoFactorSecret: { type: String }, // Mã hóa khi lưu
    twoFactorPhoneNumber: { type: String },
    twoFactorBackupCodes: [{ type: String }], // === Cài đặt Quyền riêng tư ===

    twoFactorTempCode: { type: String },
    twoFactorTempCodeExpires: { type: Date },

    unusualActivity: { type: Boolean, default: true },
    newDeviceLogin: { type: Boolean, default: true },
    passwordChange: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Securitys", securitySchema);
