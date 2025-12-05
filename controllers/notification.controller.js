import Notifications from '../models/Notifications.js';

// Model Notifications của bạn (từ tin nhắn đầu tiên)
// {
//   user: { type: mongoose.Schema.Types.ObjectId, ref: "User", ... },
//   pushEnabled: { type: Boolean, default: true },
//   emailEnabled: { type: Boolean, default: false },
//   newFollowers: { type: Boolean, default: true },
//   newRecipes: { type: Boolean, default: true},
//   likes: { type: Boolean, default: true },
//   comments: { type: Boolean, default: true },
// }

/**
 * @desc    Lấy cài đặt thông báo của user
 * @route   GET /api/settings/notifications
 * @access  Private
 */
export const getNotificationSettings = async (req, res) => {
  try {
    const userId = req.user.id;

    // Dùng findOneAndUpdate + upsert
    // 1. Tìm cài đặt của user
    // 2. Nếu không có (user mới), TỰ ĐỘNG TẠO bản ghi mới với giá trị mặc định
    const settings = await Notifications.findOneAndUpdate(
      { user: userId },
      { $setOnInsert: { user: userId } }, // Chỉ set 'user' khi tạo mới
      { upsert: true, new: true, runValidators: true } // 'new: true' để trả về bản ghi (mới hoặc cũ)
    );

    res.json(settings);
  } catch (error) {
    console.error('Lỗi khi lấy cài đặt thông báo:', error);
    res.status(500).json({ message: 'Lỗi máy chủ' });
  }
};

/**
 * @desc    Cập nhật cài đặt thông báo của user
 * @route   PUT /api/settings/notifications
 * @access  Private
 */
export const updateNotificationSettings = async (req, res) => {
  try {
    const userId = req.user.id;
    const updates = req.body;

    // 1. Chỉ cho phép cập nhật các trường cụ thể (bảo mật)
    const allowedUpdates = [
      'pushEnabled', 'emailEnabled', 
      'newFollowers', 'newRecipes', 'likes', 'comments'
    ];
    const finalUpdates = {};

    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        finalUpdates[key] = updates[key];
      }
    }

    // 2. Cập nhật và trả về dữ liệu mới
    const updatedSettings = await Notifications.findOneAndUpdate(
      { user: userId },
      { $set: finalUpdates },
      { new: true, runValidators: true } // 'new: true' để trả về bản ghi đã cập nhật
    );

    if (!updatedSettings) {
      return res.status(404).json({ message: 'Không tìm thấy cài đặt cho user này.' });
    }

    res.json(updatedSettings);
  } catch (error) {
    console.error('Lỗi khi cập nhật cài đặt thông báo:', error);
    res.status(500).json({ message: 'Lỗi máy chủ' });
  }
};