// controllers/payment-method.controller.js
import PaymentMethod from "../models/PaymentMethod.js";

/**
 * @desc    Lấy tất cả PTTT đã lưu của user
 * @route   GET /api/v1/payment-methods
 * @access  Private
 */
export const getMyPaymentMethods = async (req, res) => {
  try {
    const methods = await PaymentMethod.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(methods);
  } catch (err) {
    res.status(500).json({ message: "Lỗi máy chủ" });
  }
};

/**
 * @desc    Thêm một PTTT mới (VNPay, MoMo)
 * @route   POST /api/v1/payment-methods
 * @access  Private
 */
export const addPaymentMethod = async (req, res) => {
  try {
    const { type, label } = req.body;
    if (!type || !label) {
      return res.status(400).json({ message: "Thiếu type hoặc label" });
    }

    const existingMethods = await PaymentMethod.countDocuments({ user: req.user.id });

    const newMethod = new PaymentMethod({
      user: req.user.id,
      type,
      label,
      isDefault: existingMethods === 0, // Mặc định nếu là cái đầu tiên
    });

    const savedMethod = await newMethod.save();
    res.status(201).json(savedMethod);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

/**
 * @desc    Xóa một PTTT
 * @route   DELETE /api/v1/payment-methods/:id
 * @access  Private
 */
export const removePaymentMethod = async (req, res) => {
  try {
    const method = await PaymentMethod.findOne({
      _id: req.params.id,
      user: req.user.id, // Đảm bảo user chỉ xóa PTTT của chính họ
    });

    if (!method) {
      return res.status(404).json({ message: "Không tìm thấy phương thức" });
    }

    // Logic quan trọng: Nếu xóa PTTT mặc định,
    // hãy chọn một PTTT khác làm mặc định
    if (method.isDefault) {
      const otherMethod = await PaymentMethod.findOne({
        user: req.user.id,
        _id: { $ne: req.params.id }, // $ne = not equal
      }).sort({ createdAt: 1 }); // Chọn cái cũ nhất

      if (otherMethod) {
        otherMethod.isDefault = true;
        await otherMethod.save();
      }
    }

    await method.deleteOne();
    res.json({ message: "Đã xóa phương thức" });
  } catch (err) {
    res.status(500).json({ message: "Lỗi máy chủ" });
  }
};

/**
 * @desc    Đặt một PTTT làm mặc định
 * @route   PATCH /api/v1/payment-methods/:id/default
 * @access  Private
 */
export const setDefaultPaymentMethod = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Bỏ mặc định tất cả PTTT khác của user
    await PaymentMethod.updateMany(
      { user: req.user.id, _id: { $ne: id } },
      { $set: { isDefault: false } }
    );

    // 2. Đặt PTTT này làm mặc định
    const updatedMethod = await PaymentMethod.findOneAndUpdate(
      { _id: id, user: req.user.id },
      { $set: { isDefault: true } },
      { new: true } // Trả về document đã cập nhật
    );

    if (!updatedMethod) {
      return res.status(404).json({ message: "Không tìm thấy phương thức" });
    }
    res.json(updatedMethod);
  } catch (err) {
    res.status(500).json({ message: "Lỗi máy chủ" });
  }
};