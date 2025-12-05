// models/Report.js
import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  reporter: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  type: {
    type: String,
    enum: ['violation', 'support'], 
    default: 'violation'
  },
  title: {
    type: String,
    required: false 
  },
  reportedPost: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Post',
  },
  reportedComment: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
  },
  reason: { 
    type: String, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['pending', 'reviewed', 'resolved'], 
    default: 'pending' 
  }
}, { timestamps: true });

// --- CẬP NHẬT INDEX MỚI TẠI ĐÂY ---

// Chỉ chặn trùng lặp NẾU reportedPost là một ObjectId hợp lệ (bỏ qua null)
reportSchema.index(
  { reporter: 1, reportedPost: 1 },
  { 
    unique: true, 
    partialFilterExpression: { reportedPost: { $type: "objectId" } } 
  }
);

// Tương tự với comment
reportSchema.index(
  { reporter: 1, reportedComment: 1 },
  { 
    unique: true, 
    partialFilterExpression: { reportedComment: { $type: "objectId" } } 
  }
);

// Validate (Giữ nguyên)
reportSchema.pre('validate', function(next) {
    if (this.type === 'violation') {
        if (!this.reportedPost && !this.reportedComment) {
            return next(new Error('Report violation must be for either a post or a comment.'));
        }
    }
    next();
});

export default mongoose.model('Report', reportSchema);