// controllers/subscriptionController.js
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";

/**
 * @desc    Lấy gói đăng ký hiện tại của người dùng (hoặc tạo nếu chưa có)
 * @route   GET /api/v1/me/subscription
 * @access  Private
 */
export const getMySubscription = async (req, res) => {
  try {
    const userId = req.user.id;

    let subscription = await Subscription.findOne({ user: userId });

    // 👇 **LOGIC SỬA LỖI CHO USER CŨ**
    if (!subscription) {
      // User này tồn tại nhưng subscription thì chưa.
      // Đây là user cũ, cần "backfill" (bổ sung) dữ liệu.
      console.warn(`Không tìm thấy sub, đang tạo gói 'free' mặc định cho user cũ: ${userId}`);
      
      try {
        subscription = await Subscription.create({
          user: userId,
          planId: "free",
          tier: "free",
          autoRenew: false,
          price: 0,
          currency: "USD",
          startDate: new Date(),
          endDate: null,
        });
      } catch (createError) {
        // Xử lý trường hợp có lỗi (ví dụ: lỗi trùng lặp nếu có 2 request cùng lúc)
        console.error("Lỗi khi backfill subscription:", createError);
        if (createError.code === 11000) { // Lỗi trùng key
           subscription = await Subscription.findOne({ user: userId });
        } else {
          throw createError; // Ném lỗi nếu là lỗi khác
        }
      }
    }

    // Trả về thông tin gói (luôn luôn có)
    res.json(subscription);

  } catch (err) {
    console.error("Lỗi khi lấy getMySubscription:", err);
    res.status(500).json({ message: "Lỗi máy chủ nội bộ" });
  }
};

/**
 * @desc    Hủy gói đăng ký (tắt tự động gia hạn)
 * @route   DELETE /api/v1/me/subscription
 * @access  Private
 */
export const cancelMySubscription = async (req, res) => {
  try {
    const userId = req.user.id;

    // Hàm này không cần thay đổi
    const subscription = await Subscription.findOneAndUpdate(
      { user: userId, tier: { $ne: "free" } },
      { $set: { autoRenew: false } }, 
      { new: true }
    );

    if (!subscription) {
      return res.status(404).json({ 
        message: "Không tìm thấy gói đăng ký đang hoạt động để hủy." 
      });
    }

    res.json(subscription);
    
  } catch (err) {
    console.error("Lỗi khi hủy cancelMySubscription:", err);
    res.status(500).json({ message: "Lỗi máy chủ nội bộ" });
  }
};