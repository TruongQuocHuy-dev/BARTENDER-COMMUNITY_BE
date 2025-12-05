import express from 'express';
import { handleChat } from '../controllers/chatbot.controller.js';
import { optionalAuth } from '../middlewares/authMiddleware.js';

const router = express.Router();

/**
 * @route   POST /api/v1/chat
 * @desc    Xử lý tin nhắn chatbot
 * @access  Public (nhưng có kiểm tra auth nếu có)
 */
router.post('/', optionalAuth, handleChat); //

export default router;