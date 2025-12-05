// controllers/userActionController.js
import User from '../models/User.js';
import Post from '../models/Post.js';
import Report from '../models/Report.js';
import Comment from '../models/Comment.js';
import mongoose from 'mongoose';

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/**
 * CHẶN / BỎ CHẶN MỘT USER (2 CHIỀU)
 * POST /api/users/:userId/block
 */
export const blockUser = async (req, res) => {
  try {
    const currentUserId = req.user.id; // Người chặn (User A)
    const userIdToBlock = req.params.userId; // Người bị chặn (User B)

    if (currentUserId === userIdToBlock) {
      return res.status(400).json({ message: "You cannot block yourself" });
    }
    if (!isValidId(userIdToBlock)) {
      return res.status(400).json({ message: "Invalid User ID" });
    }

    const [currentUser, userToBlock] = await Promise.all([
      User.findById(currentUserId),
      User.findById(userIdToBlock)
    ]);

    if (!userToBlock) {
      return res.status(404).json({ message: "User to block not found" });
    }

    // Kiểm tra xem đã chặn chưa
    const isBlocked = currentUser.blockedUsers.includes(userToBlock._id);
    let message = '';

    if (isBlocked) {
      // Bỏ chặn 2 chiều
      currentUser.blockedUsers.pull(userToBlock._id);
      userToBlock.blockedUsers.pull(currentUser._id);
      message = 'User unblocked';
    } else {
      // Chặn 2 chiều
      currentUser.blockedUsers.push(userToBlock._id);
      userToBlock.blockedUsers.push(currentUser._id);
      message = 'User blocked';
    }

    await Promise.all([currentUser.save(), userToBlock.save()]);
    res.status(200).json({ message });

  } catch (err) {
    res.status(500).json({ message: "Failed to block user", error: err.message });
  }
};

/**
 * BÁO CÁO MỘT BÀI VIẾT
 * POST /api/posts/:postId/report
 */
export const reportPost = async (req, res) => {
  try {
    const reporterId = req.user.id;
    const { postId } = req.params;
    const { reason = "No reason provided" } = req.body;

    if (!isValidId(postId)) {
      return res.status(400).json({ message: "Invalid Post ID" });
    }

    // Kiểm tra xem đã báo cáo post này chưa
    const existingReport = await Report.findOne({
      reporter: reporterId,
      reportedPost: postId
    });

    if (existingReport) {
      return res.status(400).json({ message: 'You have already reported this post' });
    }

    // Tạo báo cáo mới
    await Report.create({
      reporter: reporterId,
      reportedPost: postId,
      reason: reason
    });

    res.status(201).json({ message: 'Post reported successfully' });

  } catch (err) {
    res.status(500).json({ message: "Failed to report post", error: err.message });
  }
};

/**
 * ĐÁNH DẤU "KHÔNG QUAN TÂM" MỘT BÀI VIẾT
 * POST /api/posts/:postId/not-interested
 */
export const markPostAsNotInterested = async (req, res) => {
  try {
    const userId = req.user.id;
    const { postId } = req.params;

    if (!isValidId(postId)) {
      return res.status(400).json({ message: "Invalid Post ID" });
    }

    // Thêm userId vào mảng 'notInterestedBy' của Post
    // Dùng $addToSet để đảm bảo không bị trùng lặp
    await Post.findByIdAndUpdate(postId, {
      $addToSet: { notInterestedBy: userId }
    });

    res.status(200).json({ message: 'Post marked as not interested' });

  } catch (err) {
    res.status(500).json({ message: "Failed to mark post", error: err.message });
  }
};

/**
 * HẠN CHẾ MỘT USER (1 CHIỀU)
 * POST /api/users/:userId/restrict
 */
export const restrictUser = async (req, res) => {
   try {
    const currentUserId = req.user.id;
    const userIdToRestrict = req.params.userId;

    if (currentUserId === userIdToRestrict) {
      return res.status(400).json({ message: "You cannot restrict yourself" });
    }
    if (!isValidId(userIdToRestrict)) {
      return res.status(400).json({ message: "Invalid User ID" });
    }

    const currentUser = await User.findById(currentUserId);
    
    // Thêm user vào danh sách hạn chế
    // Dùng $addToSet để tránh trùng lặp
    await User.findByIdAndUpdate(currentUserId, {
        $addToSet: { restrictedUsers: userIdToRestrict }
    });
    
    res.status(200).json({ message: 'User restricted' });
    // (FE sẽ tự xử lý logic ẩn comment từ user này)

  } catch (err) {
    res.status(500).json({ message: "Failed to restrict user", error: err.message });
  }
};

/**
 * BÁO CÁO MỘT BÌNH LUẬN
 * POST /api/comments/:commentId/report
 */
export const reportComment = async (req, res) => {
  try {
    const reporterId = req.user.id;
    const { commentId } = req.params;
    const { reason = "Báo cáo từ menu bình luận" } = req.body; // Lý do mặc định

    if (!isValidId(commentId)) {
      return res.status(400).json({ message: "Invalid Comment ID" });
    }

    // Kiểm tra comment tồn tại
    const commentExists = await Comment.findById(commentId);
    if (!commentExists) {
      return res.status(404).json({ message: "Comment not found" });
    }

    // Kiểm tra xem đã báo cáo comment này chưa
    const existingReport = await Report.findOne({
      reporter: reporterId,
      reportedComment: commentId // <-- Sửa: reportedComment
    });

    if (existingReport) {
      return res.status(400).json({ message: 'You have already reported this comment' });
    }

    // Tạo báo cáo mới (tham chiếu đến comment)
    await Report.create({
      reporter: reporterId,
      reportedComment: commentId, // <-- Sửa: reportedComment
      reason: reason
    });

    res.status(201).json({ message: 'Comment reported successfully' });

  } catch (err) {
    res.status(500).json({ message: "Failed to report comment", error: err.message });
  }
};

/**
 * GỬI YÊU CẦU HỖ TRỢ (CONTACT US)
 * POST /api/reports/support
 */
export const sendSupportRequest = async (req, res) => {
  try {
    const senderId = req.user.id;
    const { subject, message } = req.body; // Nhận từ Frontend

    if (!subject || !message) {
      return res.status(400).json({ message: "Vui lòng nhập tiêu đề và nội dung" });
    }

    // Tạo record mới trong bảng Report nhưng type là 'support'
    await Report.create({
      reporter: senderId,
      type: 'support',      // Đánh dấu là hỗ trợ
      title: subject,       // Lưu tiêu đề form
      reason: message,      // Lưu nội dung message vào trường reason
      // Không cần reportedPost hay reportedComment
    });

    res.status(201).json({ message: 'Đã gửi yêu cầu hỗ trợ thành công' });

  } catch (err) {
    res.status(500).json({ message: "Gửi yêu cầu thất bại", error: err.message });
  }
};