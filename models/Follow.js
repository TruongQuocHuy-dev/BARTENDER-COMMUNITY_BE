// models/Follow.js
import mongoose from 'mongoose';

const followSchema = new mongoose.Schema({
  // Người thực hiện theo dõi
  follower: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true // Index để query nhanh follower
  },
  // Người được theo dõi
  following: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true // Index để query nhanh following
  },
}, {
  timestamps: true // Tự động thêm createdAt, updatedAt
});

// Đảm bảo không có cặp follower-following trùng lặp
followSchema.index({ follower: 1, following: 1 }, { unique: true });

export default mongoose.model('Follow', followSchema);