import mongoose from 'mongoose';

// Xóa collection cũ nếu tồn tại
try {
  await mongoose.connection.dropCollection('banners');
} catch (err) {
  // Bỏ qua lỗi nếu collection chưa tồn tại
}

const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    imageUrl: { type: String, required: true },
    link: { type: String, required: true },
    status: { 
      type: String, 
      enum: ['active', 'inactive'], 
      default: 'active' 
    },
    priority: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    highlights: [String],
    contentDetail: String,
    startDate: { type: Date },
    endDate: { type: Date }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

export default mongoose.model('Banner', bannerSchema);
