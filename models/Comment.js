import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  imageUrl: { type: String }, // URL ảnh đính kèm (nếu có)
  parentComment: { // ID của comment cha (nếu là reply)
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null // Comment gốc sẽ là null
  },
  // parentComment: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }, // Cho chức năng reply sau này
}, { timestamps: true });

// Virtual để tính likeCount (tương tự Post)
commentSchema.virtual('likeCount').get(function() { return this.likes.length; });
commentSchema.set('toJSON', { virtuals: true });
commentSchema.set('toObject', { virtuals: true });

export default mongoose.model('Comment', commentSchema);