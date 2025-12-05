import mongoose from "mongoose";

const deviceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    
    // ✅ BẮT BUỘC: Thêm trường này
    uniqueId: { 
      type: String, 
      required: true 
    },

    name: String,
    os: String,
    browser: String,
    ip: String,
    location: String,
    lastActive: { type: Date, default: Date.now },
    current: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ✅ Thêm index để tìm kiếm nhanh
deviceSchema.index({ user: 1, uniqueId: 1 }, { unique: true });

export default mongoose.model("Device", deviceSchema);
