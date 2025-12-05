// models/User.js
import mongoose from "mongoose";
import Securitys from "./Securitys.js";
import Notifications from "./Notifications.js";

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    bio: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: false },
    phone: { type: String },
    location: { type: String },
    website: { type: String },
    avatarUrl: { type: String, default: "" },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    googleId: { type: String },
    facebookId: { type: String },
    isVerified: { type: Boolean, default: false }, // email verified
    verificationToken: { type: String }, // token for email verification
    verificationTokenExpires: { type: Date },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    followersCount: {
      // Số người theo dõi user này
      type: Number,
      default: 0,
    },
    followingCount: {
      // Số người user này đang theo dõi
      type: Number,
      default: 0,
    },
    hiddenConversations: {
      type: Map,
      of: Date, // Key = "idA_idB", Value = 2025-10-30T10:00:00Z
      default: {},
    },
    blockedUsers: [
      {
        // Những người bạn chặn VÀ những người chặn bạn
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    restrictedUsers: [
      {
        // Những người bạn hạn chế (họ không biết)
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    profileVisibility: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "public",
    },
    allowMessages: {
      type: String,
      enum: ["everyone", "followers", "none"],
      default: "everyone",
    },
    securitySettings: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Securitys", // (Tên model 'Securitys' của bạn)
    },
    notificationSettings: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Notifications", // (Tên model 'Notifications' của bạn)
    },
  },
  { timestamps: true }
);

userSchema.post("save", async function (doc, next) {
  if (this.isNew) {
    try {
      // Sử dụng đúng tên model bạn đã định nghĩa
      const SecurityModel = mongoose.model("Securitys");
      const NotificationModel = mongoose.model("Notifications");
      const SubscriptionModel = mongoose.model("Subscription");
      const [security, notifications, subscription] = await Promise.all([
        SecurityModel.create({ user: doc._id }),
        NotificationModel.create({ user: doc._id }),
        SubscriptionModel.create({
          user: doc._id,
          planId: "free", // Khớp với SubscriptionPlan
          tier: "free",
          autoRenew: false,
          price: 0,
          currency: "USD",
          startDate: new Date(),
          endDate: null,
        }),
      ]);

      // Cập nhật lại user để lưu ID của 2 bảng settings
      doc.securitySettings = security._id;
      doc.notificationSettings = notifications._id;
      await doc.save();
    } catch (err) {
      console.error("Lỗi khi tự động tạo User Settings/Subscription:", err);
    }
  }
  next();
});

export default mongoose.model("User", userSchema);
