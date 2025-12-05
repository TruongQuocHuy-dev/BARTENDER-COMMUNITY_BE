// controllers/subscriptionPlanController.js
import SubscriptionPlan from "../models/SubscriptionPlan.js";

/**
 * @desc    Lấy tất cả các gói đăng ký
 * @route   GET /api/v1/subscription-plans
 * @access  Public (hoặc Private, tùy bạn)
 */
export const getAllPlans = async (req, res) => {
  try {
    // Lấy tất cả các plan từ DB
    const plans = await SubscriptionPlan.find().sort({ price: 1 }); // Sắp xếp theo giá tăng dần
    
    if (!plans || plans.length === 0) {
        return res.status(404).json({ message: "Không tìm thấy gói đăng ký nào." });
    }

    res.json(plans);
  } catch (err) {
    console.error("Lỗi khi lấy subscription plans:", err);
    res.status(500).json({ message: "Lỗi máy chủ nội bộ" });
  }
};

export const getPlanById = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: 'Không tìm thấy gói' });
    res.json(plan);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi máy chủ nội bộ' });
  }
};

export const createPlan = async (req, res) => {
  try {
    const { planId, tier, name, price, currency = 'USD', billingCycle, features = [], popularPlan = false } = req.body;
    if (!planId || !tier || !name || price === undefined || !billingCycle) {
      return res.status(400).json({ message: 'Thiếu trường bắt buộc' });
    }
    const exists = await SubscriptionPlan.findOne({ planId });
    if (exists) return res.status(409).json({ message: 'planId đã tồn tại' });
    const doc = await SubscriptionPlan.create({ planId, tier, name, price, currency, billingCycle, features, popularPlan });
    res.status(201).json(doc);
  } catch (err) {
    console.error('createPlan error:', err);
    res.status(500).json({ message: 'Không thể tạo gói' });
  }
};

export const updatePlan = async (req, res) => {
  try {
    const update = req.body;
    const doc = await SubscriptionPlan.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ message: 'Không tìm thấy gói' });
    res.json(doc);
  } catch (err) {
    console.error('updatePlan error:', err);
    res.status(500).json({ message: 'Không thể cập nhật gói' });
  }
};

export const deletePlan = async (req, res) => {
  try {
    const doc = await SubscriptionPlan.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Không tìm thấy gói' });
    res.json({ message: 'Đã xóa gói' });
  } catch (err) {
    console.error('deletePlan error:', err);
    res.status(500).json({ message: 'Không thể xóa gói' });
  }
};