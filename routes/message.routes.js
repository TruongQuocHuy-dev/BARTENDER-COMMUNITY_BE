import express from 'express';
import { protect } from '../middlewares/authMiddleware.js'; // Middleware xác thực
import { sendMessage, getChatHistory, getConversations, deleteMessage, hideConversation, markAsRead } from '../controllers/message.controller.js';

const router = express.Router();

// Tất cả các route trong file này đều yêu cầu đăng nhập
router.use(protect);

router.get('/messages/conversations', getConversations);

// Gửi tin nhắn mới
// POST /api/messages
router.post('/messages', sendMessage);
router.delete('/messages/:messageId', deleteMessage);
router.post('/messages/conversations/hide', hideConversation);

// Lấy lịch sử tin nhắn với người dùng khác
// GET /api/messages/history/:otherUserId?page=1&limit=30
router.get('/messages/history/:otherUserId', getChatHistory);

router.put('/messages/read/:otherUserId', markAsRead);
// (Có thể thêm các route khác sau: xóa tin nhắn, đánh dấu đã đọc, lấy danh sách cuộc trò chuyện...)

export default router;