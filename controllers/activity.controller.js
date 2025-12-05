import Activity from "../models/Activity.js"; // Đảm bảo đường dẫn đúng

// @desc    Lấy danh sách hoạt động (thông báo) cho user đã đăng nhập
// @route   GET /api/activities
// @access  Private
export const getActivities = async (req, res) => {
  try {
    // 1. Lấy ID user từ middleware xác thực (từ JWT)
    
    // ==========================================
    // ===== SỬA LỖI TẠI ĐÂY =====
    const loggedInUserId = req.user._id; // Sửa từ req.user.userId thành req.user._id
    // ==========================================

    // 2. Xử lý phân trang (Pagination)
    const page = parseInt(req.query.page) || 1;
    const limit = 20; // Số lượng thông báo mỗi trang
    const skip = (page - 1) * limit;

    // 3. Truy vấn database
    const activities = await Activity.find({ user: loggedInUserId })
      .populate({
        path: "actor",
        select: "fullName avatarUrl",
      })
      .sort({ createdAt: -1 }) 
      .skip(skip)
      .limit(limit);

    // 4. Lấy tổng số lượng để tính toán số trang
    const totalActivities = await Activity.countDocuments({
      user: loggedInUserId,
    });
    
    // Log debug (bạn có thể xoá sau khi chạy)
    console.log("--- DEBUG (Đã sửa): ---");
    console.log("User ID đang tìm kiếm:", loggedInUserId);
    console.log("Số lượng activity tìm thấy:", activities.length);
    
    res.status(200).json({
      activities,
      currentPage: page,
      totalPages: Math.ceil(totalActivities / limit),
    });
      
  } catch (error) {
    console.error("Lỗi khi lấy activities:", error);
    res.status(500).json({ message: "Lỗi máy chủ" });
  }
};

// @desc    Đánh dấu 1 thông báo là đã đọc
// @route   PATCH /api/activities/:id/read
// @access  Private
export const markOneAsRead = async (req, res) => {
  try {
    const activity = await Activity.findOneAndUpdate(
      // Chỉ user sở hữu mới được cập nhật
      { _id: req.params.id, user: req.user._id },
      { $set: { read: true } },
      { new: true } // Trả về document đã cập nhật
    );

    if (!activity) {
      return res.status(404).json({ message: "Không tìm thấy thông báo" });
    }

    res.json(activity);
  } catch (error) {
    console.error("markOneAsRead error:", error);
    res.status(500).json({ message: "Lỗi máy chủ" });
  }
};

// @desc    Xóa 1 thông báo
// @route   DELETE /api/activities/:id
// @access  Private
export const deleteActivity = async (req, res) => {
  try {
    const activity = await Activity.findOneAndDelete({
      // Chỉ user sở hữu mới được xóa
      _id: req.params.id,
      user: req.user._id,
    });

    if (!activity) {
      return res.status(404).json({ message: "Không tìm thấy thông báo" });
    }

    res.status(200).json({ success: true, message: "Đã xóa thông báo" });
  } catch (error) {
    console.error("deleteActivity error:", error);
    res.status(500).json({ message: "Lỗi máy chủ" });
  }
};

// @desc    Đánh dấu TẤT CẢ thông báo là đã đọc
// @route   POST /api/activities/mark-read
// @access  Private
export const markAllAsRead = async (req, res) => {
  try {
    // Cập nhật tất cả document có 'user' là user đang login
    // và 'read' đang là false
    await Activity.updateMany(
      { user: req.user._id, read: false }, // Chỉ cập nhật cái chưa đọc
      { $set: { read: true } }
    );

    res.status(200).json({ success: true, message: "Đã đánh dấu tất cả là đã đọc" });
  } catch (error) {
    console.error("markAllAsRead error:", error);
    res.status(500).json({ message: "Lỗi máy chủ" });
  }
};