import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    // Người gửi
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Tham chiếu đến model User
        required: true,
        index: true, // Index để tìm kiếm nhanh
    },
    // Người nhận
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    // Nội dung tin nhắn (cho text)
    content: {
        type: String,
        trim: true,
        // Không required vì có thể là tin nhắn media
    },
    // URL ảnh (nếu là tin nhắn ảnh)
    imageUrl: {
        type: String,
        trim: true,
    },
    // URL video (nếu là tin nhắn video)
    videoUrl: {
        type: String,
        trim: true,
    },
    // Loại tin nhắn: 'text', 'image', 'video'
    messageType: {
        type: String,
        enum: ['text', 'image', 'video'],
        required: true,
        default: 'text',
    },
    // Trạng thái đã đọc (có thể quản lý phức tạp hơn)
    isRead: {
        type: Boolean,
        default: false,
    },
    // ID cuộc trò chuyện (để nhóm tin nhắn dễ dàng hơn)
    // Tạo bằng cách kết hợp ID người gửi và người nhận (luôn theo thứ tự cố định)
    conversationId: {
        type: String,
        required: true,
        index: true,
    }
}, {
    timestamps: true, // Tự động thêm createdAt, updatedAt
});

// Đảm bảo chỉ có một trong content, imageUrl, videoUrl
messageSchema.pre('save', function(next) {
    const textExists = this.content && this.content.length > 0;
    const imageExists = this.imageUrl && this.imageUrl.length > 0;
    const videoExists = this.videoUrl && this.videoUrl.length > 0;

    // Đảm bảo loại tin nhắn khớp với nội dung
    if (textExists && this.messageType !== 'text') {
        return next(new Error('Message content provided but type is not text.'));
    }
    if (imageExists && this.messageType !== 'image') {
        return next(new Error('Image URL provided but type is not image.'));
    }
    if (videoExists && this.messageType !== 'video') {
         return next(new Error('Video URL provided but type is not video.'));
    }
    if (!textExists && !imageExists && !videoExists) {
        return next(new Error('Message must contain text, an image URL, or a video URL.'));
    }
    next();
});


export default mongoose.model('Message', messageSchema);