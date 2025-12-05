import mongoose from "mongoose";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { sendNotificationToExternalIds } from "../services/notification.service.js";
import Notifications from "../models/Notifications.js";

// --- Helper Functions ---
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const getConversationId = (userId1, userId2) => {
  return [userId1.toString(), userId2.toString()].sort().join("_");
};

// --- Helper mới để "hiện lại" chat khi có tin nhắn mới ---
const unhideConversation = async (userId, conversationId) => {
  try {
    // Xóa key khỏi Map bằng $unset
    const field = `hiddenConversations.${conversationId}`;
    // Dùng $unset để xóa trường khỏi Map
    await User.findByIdAndUpdate(userId, { $unset: { [field]: "" } });
  } catch (err) {
    console.error(
      `Failed to unhide conversation ${conversationId} for user ${userId}:`,
      err
    );
    // Không block gửi tin nhắn, chỉ log lỗi
  }
};

/**
 * GET /api/messages/conversations
 * (Đã cập nhật: Lọc ra các cuộc trò chuyện đã bị ẩn)
 */
export const getConversations = async (req, res) => {
  const currentUserId = new mongoose.Types.ObjectId(req.user.id);

  try {
    // 1. Lấy Map các cuộc trò chuyện đã ẩn của user
    // Dùng .lean() để lấy object JS thuần, sẽ nhanh hơn
    const user = await User.findById(req.user.id)
      .select("hiddenConversations")
      .lean();

    // Lấy danh sách các KEY (là các conversationId) đã bị ẩn
    // Vì đã dùng .lean(), hiddenConversations là một object thuần
    const hiddenIds =
      user && user.hiddenConversations
        ? Object.keys(user.hiddenConversations)
        : []; // 2. Dùng Aggregate để tìm tin nhắn cuối

    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [{ sender: currentUserId }, { receiver: currentUserId }],
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$conversationId",
          lastMessage: { $first: "$$ROOT" },
        },
      },

      // 3. LỌC BỎ NHỮNG CUỘC TRÒ CHUYỆN ĐÃ ẨN
      { $match: { _id: { $nin: hiddenIds } } },

      { $sort: { "lastMessage.createdAt": -1 } },
      {
        $lookup: {
          from: "users",
          localField: "lastMessage.sender",
          foreignField: "_id",
          as: "senderInfo",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "lastMessage.receiver",
          foreignField: "_id",
          as: "receiverInfo",
        },
      },
      { $unwind: "$senderInfo" },
      { $unwind: "$receiverInfo" },
      {
        $project: {
          _id: 1,
          lastMessage: "$lastMessage",
          otherUser: {
            $cond: {
              if: { $eq: ["$lastMessage.sender", currentUserId] },
              then: "$receiverInfo",
              else: "$senderInfo",
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          lastMessage: 1,
          // Chỉ lấy các trường cần thiết của otherUser
          "otherUser._id": "$otherUser._id",
          "otherUser.fullName": "$otherUser.fullName",
          "otherUser.avatarUrl": "$otherUser.avatarUrl",
        },
      },
    ]); // 4. Đếm tin nhắn chưa đọc (giữ nguyên)

    const unreadCounts = await Message.aggregate([
      { $match: { receiver: currentUserId, isRead: false } },
      { $group: { _id: "$conversationId", count: { $sum: 1 } } },
    ]);

    const unreadMap = unreadCounts.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    const finalConversations = conversations.map((convo) => ({
      ...convo,
      unreadCount: unreadMap[convo._id] || 0,
    }));

    res.status(200).json(finalConversations);
  } catch (err) {
    console.error("Get conversations error:", err);
    res
      .status(500)
      .json({ message: "Failed to get conversations", error: err.message });
  }
};

/**
 * POST /api/messages
 * (Đã cập nhật: "Hiện lại" cuộc trò chuyện khi gửi tin nhắn mới)
 */
export const sendMessage = async (req, res) => {
  const senderId = req.user.id;
  const { receiverId, messageType, content, imageUrl, videoUrl } = req.body; // --- Validation (giữ nguyên) ---

  if (!receiverId || !messageType)
    return res
      .status(400)
      .json({ message: "Receiver ID and message type are required." });
  if (!isValidId(receiverId))
    return res.status(400).json({ message: "Invalid Receiver ID." });
  if (senderId === receiverId)
    return res
      .status(400)
      .json({ message: "Cannot send message to yourself." });
  if (messageType === "text" && (!content || content.trim() === ""))
    return res.status(400).json({ message: "Text content is required." });
  if (messageType === "image" && !imageUrl)
    return res.status(400).json({ message: "Image URL is required." });
  if (messageType === "video" && !videoUrl)
    return res.status(400).json({ message: "Video URL is required." }); // -----------------
  try {
    const receiverExists = await User.findById(receiverId).select("_id");
    if (!receiverExists) {
      return res.status(404).json({ message: "Receiver user not found." });
    }

    const conversationId = getConversationId(senderId, receiverId);

    // --- ✨ LOGIC MỚI: HIỆN LẠI CHAT KHI GỬI TIN NHẮN ---
    // Hiện lại cho người gửi (nếu họ đã xóa)
    await unhideConversation(senderId, conversationId);
    // Hiện lại cho người nhận (nếu lỡ họ cũng xóa)
    await unhideConversation(receiverId, conversationId);
    // --------------------------------------------------

    const newMessage = await Message.create({
      sender: senderId,
      receiver: receiverId,
      messageType,
      content: messageType === "text" ? content.trim() : undefined,
      imageUrl: messageType === "image" ? imageUrl.trim() : undefined,
      videoUrl: messageType === "video" ? videoUrl.trim() : undefined,
      conversationId: conversationId,
    });

    const populatedMessage = await Message.findById(newMessage._id).populate(
      "sender",
      "fullName avatarUrl _id"
    ); // TODO: Gửi tin nhắn real-time qua WebSocket (Socket.IO) // global.io.to(receiverId).emit('newMessage', populatedMessage);

    const isRecipientOnline = false; // TODO: Thay bằng logic kiểm tra socket

  if (!isRecipientOnline) {
    try {
      const recipientId = receiverId.toString();

      // 2. Kiểm tra cài đặt (ĐÃ XÓA 'newMessages: true')
      const settings = await Notifications.findOne({
        user: recipientId,
        pushEnabled: true,
      });

      if (settings) {
        // 3. Gửi thông báo
        sendNotificationToExternalIds(
          [recipientId],
          { en: "New Message", vi: `Tin nhắn mới từ ${req.user.fullName}` },
          {
            en: populatedMessage.content || "Sent an attachment",
            vi: populatedMessage.content || "Đã gửi một tệp đính kèm",
          },
          { type: "new_message", chatId: conversationId, senderId: senderId }
        );
      }
    } catch (notifError) {
      console.error("Lỗi khi gửi thông báo 'tin nhắn mới':", notifError);
    }
  }

    res.status(201).json(populatedMessage);
  } catch (err) {
    console.error("Send message error:", err);
    if (err.name === "ValidationError") {
      return res
        .status(400)
        .json({ message: "Validation failed", error: err.message });
    }
    res
      .status(500)
      .json({ message: "Failed to send message", error: err.message });
  }
};

/**
 * GET /api/messages/history/:otherUserId
 * (Đã cập nhật: Lọc tin nhắn dựa trên thời gian đã ẩn)
 */
export const getChatHistory = async (req, res) => {
  const currentUserId = req.user.id;
  const otherUserId = req.params.otherUserId; // --- Validation (giữ nguyên) ---

  if (!otherUserId)
    return res.status(400).json({ message: "Other user ID is required." });
  if (!isValidId(otherUserId))
    return res.status(400).json({ message: "Invalid Other User ID." }); // ----------------- // --- Pagination (giữ nguyên) ---
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 30;
  const skip = (page - 1) * limit; // ------------------
  try {
    const conversationId = getConversationId(currentUserId, otherUserId);

    // --- ✨ LOGIC MỚI: KIỂM TRA THỜI GIAN XÓA ---
    // 1. Lấy thời gian xóa của user hiện tại
    const user = await User.findById(currentUserId)
      .select("hiddenConversations")
      .lean();

    // 2. Lấy ngày/giờ mà user này đã xóa
    // Dùng optional chaining và truy cập object (vì đã .lean())
    const deletedAt =
      user && user.hiddenConversations
        ? user.hiddenConversations[conversationId]
        : null;

    // 3. Tạo bộ lọc
    let filter = {
      conversationId: conversationId,
    };

    // 4. NẾU ĐÃ TỪNG XÓA, CHỈ LẤY TIN NHẮN SAU NGÀY XÓA
    if (deletedAt) {
      filter.createdAt = { $gt: new Date(deletedAt) };
    } // 5. Tìm tin nhắn VỚI BỘ LỌC MỚI
    // ------------------------------------------

    const messages = await Message.find(filter) // <-- DÙNG FILTER
      .populate("sender", "fullName avatarUrl _id")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit); // 6. Đếm tổng số tin nhắn VỚI BỘ LỌC MỚI

    const totalMessages = await Message.countDocuments(filter); // <-- DÙNG FILTER // TODO: Đánh dấu đã đọc (giữ nguyên) // ...

    res.status(200).json({
      data: messages.reverse(),
      currentPage: page,
      totalPages: Math.ceil(totalMessages / limit),
      totalMessages: totalMessages,
    });
  } catch (err) {
    console.error("Get chat history error:", err);
    res
      .status(500)
      .json({ message: "Failed to get chat history", error: err.message });
  }
};

/**
 * DELETE /api/messages/:messageId
 * (Không thay đổi - Dùng để xóa 1 tin nhắn cụ thể)
 */
export const deleteMessage = async (req, res) => {
  const currentUserId = req.user.id;
  const { messageId } = req.params; // --- Validation (giữ nguyên) ---

  if (!messageId)
    return res.status(400).json({ message: "Message ID is required." });
  if (!isValidId(messageId))
    return res.status(400).json({ message: "Invalid Message ID." }); // -----------------
  try {
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found." });
    }
    if (message.sender.toString() !== currentUserId) {
      return res
        .status(403)
        .json({ message: "You are not authorized to delete this message." });
    }
    await Message.findByIdAndDelete(messageId); // TODO: Gửi sự kiện Socket.IO // global.io.to(message.conversationId).emit('messageDeleted', { messageId });

    res
      .status(200)
      .json({ message: "Message deleted successfully.", messageId: messageId });
  } catch (err) {
    console.error("Delete message error:", err);
    res
      .status(500)
      .json({ message: "Failed to delete message", error: err.message });
  }
};

/**
 * POST /api/messages/conversations/hide
 * (Đã cập nhật: Ghi lại timestamp khi ẩn)
 */
export const hideConversation = async (req, res) => {
  const currentUserId = req.user.id;
  const { conversationId } = req.body;

  if (!conversationId) {
    return res.status(400).json({ message: "Conversation ID is required." });
  }

  try {
    // Dùng dot notation để set key trong Map
    const field = `hiddenConversations.${conversationId}`;
    await User.findByIdAndUpdate(
      currentUserId,
      // $set: Ghi lại chính xác thời điểm xóa
      { $set: { [field]: new Date() } }
    );

    res.status(200).json({ message: "Conversation hidden successfully." });
  } catch (err) {
    console.error("Hide conversation error:", err);
    res
      .status(500)
      .json({ message: "Failed to hide conversation", error: err.message });
  }
};

/**
 * PUT /api/messages/read/:otherUserId
 * (MỚI: Đánh dấu tất cả tin nhắn từ user kia là đã đọc)
 */
export const markAsRead = async (req, res) => {
  const currentUserId = req.user.id;
  const { otherUserId } = req.params;

  if (!otherUserId) {
    return res.status(400).json({ message: "Other user ID is required." });
  }

  try {
    // Tìm tất cả tin nhắn mà:
    // 1. Người gửi là otherUserId
    // 2. Người nhận là mình (currentUserId)
    // 3. Trạng thái đang là chưa đọc (isRead: false)
    await Message.updateMany(
      {
        sender: otherUserId,
        receiver: currentUserId,
        isRead: false,
      },
      {
        $set: { isRead: true },
      }
    );

    res.status(200).json({ message: "Conversation marked as read." });
  } catch (err) {
    console.error("Mark as read error:", err);
    res.status(500).json({ message: "Failed to mark as read", error: err.message });
  }
};