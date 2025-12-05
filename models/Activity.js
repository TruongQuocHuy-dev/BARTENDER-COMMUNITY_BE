import mongoose from "mongoose";

const activitySchema = new mongoose.Schema(
  {
    // 1. Người nhận thông báo
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // 2. Người thực hiện hành động (nếu có)
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // 3. Loại thông báo
    type: {
      type: String,
      enum: ["new_follower", "new_like", "new_comment", "new_recipe", "new_post"],
      required: true,
    },
    // 4. Nội dung (ID của bài post, recipe, comment...)
    entity: {
      type: mongoose.Schema.Types.ObjectId,
      // refPath: 'entityModel' // Nâng cao: nếu bạn muốn populate động
    },
    // 5. Nội dung thông báo (tùy chọn, có thể tạo ở FE)
    message: {
      type: String,
      required: true,
    },
    // 6. Trạng thái đã đọc/chưa đọc
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Activity", activitySchema);