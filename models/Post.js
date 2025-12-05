// models/Post.js
import mongoose from 'mongoose';
import Comment from './Comment.js';

const postSchema = new mongoose.Schema({
  caption: { type: String, required: true },
  imageUrl: { type: String },
  videoUrl: { type: String },
  author: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  commentCount: {
    type: Number,
    default: 0
  },
  notInterestedBy: [{ 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ----- CÁC TRƯỜNG "ẢO" (VIRTUALS) -----

// 7. "số yêu thích"
postSchema.virtual('likeCount').get(function() {
  return this.likes.length;
});

/* --- ĐÃ XÓA PHẦN NÀY ---
// 9. "số bị báo cáo" 
postSchema.virtual('reportCount').get(function() {
  return this.reports.length;
});
*/

// (Giữ nguyên pre-hook để xóa comment)
postSchema.pre('findOneAndDelete', async function(next) {
  try {
    const postToDelete = await this.model.findOne(this.getFilter());
    
    if (postToDelete) {
      await Comment.deleteMany({ post: postToDelete._id });
    }
    next();
  } catch (err) {
    next(err);
  }
});

export default mongoose.model('Post', postSchema);