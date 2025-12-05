// models/Notifications.js
import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    // Liên kết 1-1 với User
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    }, // === Kênh thông báo ===

    pushEnabled: { type: Boolean, default: true },
    emailEnabled: { type: Boolean, default: false }, // === Thông báo mạng xã hội ===

    newFollowers: { type: Boolean, default: true },
    newRecipes: { type: Boolean, default: true},
    likes: { type: Boolean, default: true },
    comments: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model( "Notifications", notificationSchema);
