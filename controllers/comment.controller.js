import Comment from "../models/Comment.js"; // Import model Comment
import Post from "../models/Post.js"; // Cần để kiểm tra Post tồn tại và cập nhật commentCount
import mongoose from "mongoose";
import User from "../models/User.js"; // Cần để kiểm tra User tồn tại
import { sendNotificationToExternalIds } from "../services/notification.service.js";
import Notifications from "../models/Notifications.js";
import Activity from "../models/Activity.js";

// --- HÀM HELPER (KIỂM TRA ID) ---
const isValidId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

/**
 * Hàm helper đệ quy để xóa comment và tất cả replies của nó
 * @param {string} commentId ID của comment cần xóa
 * @returns {Promise<number>} Tổng số comment (cha + con) đã bị xóa
 */
const deleteCommentAndReplies = async (commentId) => {
  // 1. Tìm tất cả replies trực tiếp của comment này
  const replies = await Comment.find({ parentComment: commentId });

  let deletedCount = 0;

  // 2. Đệ quy: Xóa từng reply (và các con của reply đó)
  for (const reply of replies) {
    // Cộng dồn số lượng bị xóa từ các hàm con
    deletedCount += await deleteCommentAndReplies(reply._id);
  }

  // 3. Xóa chính nó (comment cha)
  await Comment.findByIdAndDelete(commentId);
  deletedCount += 1; // Tự đếm chính nó

  return deletedCount;
};

/**
 * LẤY TẤT CẢ BÌNH LUẬN (Hỗ trợ phân trang - Dùng cẩn thận)
 * GET /api/comments
 */
export const getAllComments = async (req, res) => {
  try {
    // Phân trang
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20; // Giới hạn số lượng trả về
    const skip = (page - 1) * limit;

    let query = {}; // Query rỗng ban đầu

    // Nếu user đăng nhập
    if (req.user) {
      const blockedUsersList = req.user.blockedUsers || [];
      // Thêm điều kiện: tác giả comment không nằm trong danh sách chặn
      query.author = { $nin: blockedUsersList };
    }

    // Lấy tất cả comments, populate author và post (để biết context), sắp xếp
    const comments = await Comment.find(query) // Không lọc theo post
      .populate("author", "fullName username avatarUrl")
      .populate("post", "caption") // Populate thêm post để biết comment thuộc bài nào (chỉ lấy caption ví dụ)
      .sort({ createdAt: -1 }) // Mới nhất lên đầu
      .skip(skip)
      .limit(limit);

    // Lấy tổng số lượng comments
    const totalComments = await Comment.countDocuments(query);

    res.status(200).json({
      data: comments,
      currentPage: page,
      totalPages: Math.ceil(totalComments / limit),
      totalComments,
    });
  } catch (err) {
    console.error("Get all comments error:", err);
    res
      .status(500)
      .json({ message: "Failed to get all comments", error: err.message });
  }
};

/**
 * LẤY DANH SÁCH BÌNH LUẬN CHO BÀI ĐĂNG (ĐÃ HỖ TRỢ PHÂN TRANG)
 * GET /api/posts/:postId/comments
 */
export const getCommentsForPost = async (req, res) => {
  try {
    const { postId } = req.params;

    // --- LOGIC PHÂN TRANG (THÊM MỚI) ---
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20; // Lấy 20 comment mỗi lần
    const skip = (page - 1) * limit;
    // ---------------------------------

    if (!isValidId(postId)) {
      return res.status(400).json({ message: "Invalid Post ID" });
    }

    const postExists = await Post.findById(postId);
    if (!postExists) {
      return res.status(404).json({ message: "Post not found" });
    }

    let query = { post: postId }; // Lọc theo post ID là bắt buộc

    // Nếu user đăng nhập (nhờ optionalAuth)
    if (req.user) {
      const blockedUsersList = req.user.blockedUsers || [];
      // Thêm điều kiện: tác giả comment không nằm trong danh sách chặn
      query.author = { $nin: blockedUsersList };
    }

    // --- CẬP NHẬT QUERY ---
    const comments = await Comment.find(query)
      .populate("author", "fullName username avatarUrl")
      .sort({ createdAt: 1 }) // Sắp xếp TỪ CŨ ĐẾN MỚI (để đọc hội thoại)
      .skip(skip) // Bỏ qua trang
      .limit(limit); // Giới hạn

    // Đếm tổng số comment của post này
    const totalComments = await Comment.countDocuments({ post: postId });
    // ---------------------

    // Trả về dữ liệu kiểu phân trang
    res.status(200).json({
      data: comments,
      currentPage: page,
      totalPages: Math.ceil(totalComments / limit),
      totalComments,
    });
  } catch (err) {
    console.error("Get comments error:", err);
    res
      .status(500)
      .json({ message: "Failed to get comments", error: err.message });
  }
};
/**
 * TẠO BÌNH LUẬN MỚI (HOẶC REPLY) - Hỗ trợ ảnh
 * POST /api/posts/:postId/comments
 */
export const createComment = async (req, res) => {
  try {
    const { postId } = req.params;
    const { text, parentCommentId } = req.body;
    const image = req.files?.image?.[0];
    const userId = req.user.id;

    if (!isValidId(postId)) {
      return res.status(400).json({ message: "Invalid Post ID" });
    }
    if ((!text || text.trim() === "") && !image) {
      return res
        .status(400)
        .json({ message: "Comment cannot be empty (text or image required)" });
    }
    if (parentCommentId && !isValidId(parentCommentId)) {
      return res.status(400).json({ message: "Invalid Parent Comment ID" });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }
    
    // 👇 === SỬA LỖI Ở ĐÂY (Bước 1) === 👇
    let parentComment = null; // Khai báo 'parentComment' ở ngoài
    if (parentCommentId) {
      parentComment = await Comment.findById(parentCommentId); // Gán cho 'parentComment'
      if (!parentComment) { // Kiểm tra 'parentComment'
        return res.status(404).json({ message: "Parent comment not found" });
      }
    }
    // 👆 === KẾT THÚC SỬA LỖI (Bước 1) === 👆

    // Tạo comment mới
    const newCommentData = {
      post: postId,
      author: userId,
      text: text ? text.trim() : "",
      imageUrl: image?.path || "",
      parentComment: parentCommentId || null,
    };

    const newComment = await Comment.create(newCommentData);
    post.commentCount = (post.commentCount || 0) + 1;
    await post.save();

    // Populate author cho comment mới
    const populatedComment = await Comment.findById(newComment._id).populate(
      "author",
      "fullName username avatarUrl"
    );

    // ==========================================================
    // 👇 BẮT ĐẦU: LOGIC GỬI THÔNG BÁO PUSH
    // ==========================================================
    try {
      let recipientId = null;
      let notificationType = "new_comment";
      let message = "";
      let entityId = postId; // Mặc định là ID của bài post

      // 👇 === SỬA LỖI Ở ĐÂY (Bước 2) === 👇
      // Biến 'parentComment' bây giờ đã tồn tại
      if (parentCommentId && parentComment) { 
        // Kịch bản 1: Đây là một REPLY
        recipientId = parentComment.author.toString();
        notificationType = "new_reply"; // (Bạn cần thêm 'new_reply' vào enum của Activity)
        message = `${req.user.fullName} đã trả lời bình luận của bạn.`;
        entityId = parentCommentId; // Entity là comment cha
      } else {
        // Kịch bản 2: Đây là một COMMENT mới
        recipientId = post.author.toString();
        notificationType = "new_comment";
        message = `${req.user.fullName} đã bình luận bài viết của bạn.`;
        entityId = postId; // Entity là bài post
      }
      // 👆 === KẾT THÚC SỬA LỖI (Bước 2) === 👆

      // 1. Không gửi thông báo nếu tự tương tác
      if (recipientId && recipientId !== userId) {
        // 2. Kiểm tra cài đặt
        const settings = await Notifications.findOne({
          user: recipientId,
          pushEnabled: true,
          comments: true // Dùng chung trường 'comments'
        });
        
        // 3. Gửi Push (nếu cài đặt cho phép)
        if (settings) {
          sendNotificationToExternalIds(
            [recipientId],
            { en: "New Interaction", vi: "Tương tác mới" },
            { en: message, vi: message },
            { type: notificationType, id: postId, commentId: newComment._id.toString() }
          );
        }

        // 4. Luôn lưu vào Activity
        await Activity.create({
          user: recipientId,     // Người nhận
          actor: userId,         // Người bình luận/trả lời
          type: notificationType,
          entity: entityId,
          message: message
        });
      }
    } catch (notifError) {
      console.error("Lỗi khi gửi thông báo 'comment/reply':", notifError);
    }
    // ==========================================================
    // 👆 KẾT THÚC: LOGIC GỬI THÔNG BÁO PUSH
    // ==========================================================

    res.status(201).json(populatedComment);
  } catch (err) {
    console.error("Create comment error:", err);
    res
      .status(500)
      .json({ message: "Failed to create comment", error: err.message });
  }
};

/**
 * THÍCH / BỎ THÍCH BÌNH LUẬN
 * POST /api/comments/:commentId/likes
 */
export const likeComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id; // Lấy từ middleware 'protect'

    if (!isValidId(commentId)) {
      return res.status(400).json({ message: "Invalid Comment ID" });
    }

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    // Kiểm tra xem user đã like chưa
    const alreadyLikedIndex = comment.likes.findIndex(
      (likeId) => likeId.toString() === userId
    );

    if (alreadyLikedIndex > -1) {
      // Đã like -> Unlike
      comment.likes.splice(alreadyLikedIndex, 1);
    } else {
      // Chưa like -> Like
      comment.likes.push(userId);
    }

    await comment.save();

    const isLiking = alreadyLikedIndex === -1;
    const recipientId = comment.author.toString();

    // 1. Chỉ gửi khi 'like' và không tự 'like'
    if (isLiking && recipientId !== userId) {
      try {
        // 2. Kiểm tra cài đặt
        const settings = await Notifications.findOne({
          user: recipientId,
          pushEnabled: true,
          likes: true, // Dùng chung trường 'likes'
        });

        if (settings) {
          // 3. Gửi
          const message = `${req.user.fullName} đã thích bình luận của bạn.`;
          sendNotificationToExternalIds(
            [recipientId],
            { en: "New Like", vi: "Lượt thích mới" },
            { en: `${req.user.fullName} liked your comment.`, vi: message },
            {
              type: "new_comment_like",
              id: comment.post,
              commentId: comment._id.toString(),
            }
          );

          // 👇 === LƯU VÀO ACTIVITY === 👇
          await Activity.create({
            user: recipientId, // Người nhận
            actor: userId, // Người 'like'
            type: "new_comment_like", // (Bạn cần thêm 'new_comment_like' vào enum)
            entity: comment._id, // ID của bình luận
            message: message,
          });
          // 👆 === KẾT THÚC LƯU === 👆
        }
      } catch (notifError) {
        console.error("Lỗi khi gửi thông báo 'like comment':", notifError);
      }
    }

    // Trả về trạng thái like mới và số lượng like (tính từ virtual)
    // Cần gọi lại findById để lấy virtual field (hoặc tính thủ công)
    const updatedComment = await Comment.findById(commentId); // Lấy lại để có virtual

    res.status(200).json({
      isLiked: alreadyLikedIndex === -1,
      likeCount: updatedComment.likeCount, // Sử dụng virtual
    });
  } catch (err) {
    console.error("Like comment error:", err);
    res
      .status(500)
      .json({ message: "Failed to like comment", error: err.message });
  }
};

/**
 * CẬP NHẬT BÌNH LUẬN
 * PATCH /api/comments/:commentId
 */
export const updateComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { text } = req.body; // Chỉ cho sửa nội dung
    const userId = req.user.id;

    if (!isValidId(commentId)) {
      return res.status(400).json({ message: "Invalid Comment ID" });
    }
    if (!text || text.trim() === "") {
      return res.status(400).json({ message: "Comment text cannot be empty" });
    }

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    // Kiểm tra quyền: Chỉ chủ comment mới được sửa
    if (comment.author.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "Forbidden: You are not the author" });
    }

    // Cập nhật nội dung
    comment.text = text.trim();
    const updatedComment = await comment.save();

    // Populate lại author để trả về (nhất quán)
    const populatedComment = await Comment.findById(
      updatedComment._id
    ).populate("author", "fullName username avatarUrl");

    res.status(200).json(populatedComment); // Trả về comment đã cập nhật
  } catch (err) {
    console.error("Update comment error:", err);
    res
      .status(500)
      .json({ message: "Failed to update comment", error: err.message });
  }
};

/**
 * XÓA BÌNH LUẬN (Và tất cả replies của nó)
 * DELETE /api/comments/:commentId
 */
export const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    if (!isValidId(commentId)) {
      return res.status(400).json({ message: "Invalid Comment ID" });
    }

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    // Kiểm tra quyền
    if (comment.author.toString() !== userId) {
      // TODO: Thêm logic kiểm tra admin/chủ post nếu cần
      return res
        .status(403)
        .json({ message: "Forbidden: You cannot delete this comment" });
    }

    // --- SỬA LOGIC XÓA ---
    // Gọi hàm helper để xóa comment này và tất cả con của nó
    // Hàm này trả về tổng số lượng đã bị xóa (cha + con)
    const totalDeleted = await deleteCommentAndReplies(commentId);

    // Giảm commentCount trên Post bằng tổng số đã xóa
    if (totalDeleted > 0) {
      await Post.findByIdAndUpdate(comment.post, {
        $inc: { commentCount: -totalDeleted },
      });
    }
    // -------------------

    res.status(204).send(); // Xóa thành công
  } catch (err) {
    console.error("Delete comment error:", err);
    res
      .status(500)
      .json({ message: "Failed to delete comment", error: err.message });
  }
};
