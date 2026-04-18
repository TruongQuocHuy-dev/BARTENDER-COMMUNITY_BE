// controllers/subscriptionPlanController.js
import SubscriptionPlan from "../models/SubscriptionPlan.js";

const normalizePlanIdBase = (value = "") => {
  return String(value)
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const parseFeatures = (features) => {
  if (Array.isArray(features)) {
    return features.map((feature) => String(feature).trim()).filter(Boolean);
  }

  if (typeof features === "string") {
    return features
      .split(/[\n,]/)
      .map((feature) => String(feature).trim())
      .filter(Boolean);
  }

  return [];
};

const toPlanPayload = (input, existingPlanIds, usedPlanIds) => {
  const source = input && typeof input === "object" ? input : {};
  const name = String(source.name || "").trim();
  const providedPlanId = String(source.planId || "").trim();
  const basePlanId = normalizePlanIdBase(providedPlanId || name) || "plan";
  let planId = `${basePlanId}-1`;
  let suffix = 2;

  while (existingPlanIds.has(planId) || usedPlanIds.has(planId)) {
    planId = `${basePlanId}-${suffix}`;
    suffix += 1;
  }

  usedPlanIds.add(planId);

  return {
    planId,
    tier: source.tier,
    name,
    price: source.price,
    currency: source.currency || "USD",
    billingCycle: source.billingCycle,
    features: parseFeatures(source.features),
    popularPlan: Boolean(source.popularPlan),
  };
};

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
    const incomingPlans = Array.isArray(req.body)
      ? req.body
      : Array.isArray(req.body?.plans)
        ? req.body.plans
        : [req.body];

    const existingPlanIds = new Set(
      (await SubscriptionPlan.find({}, { planId: 1, _id: 0 })).map((plan) => plan.planId),
    );
    const usedPlanIds = new Set();

    const normalizedPlans = incomingPlans.map((plan, index) => {
      const payload = toPlanPayload(plan, existingPlanIds, usedPlanIds);

      if (!payload.tier || !payload.name || payload.price === undefined || !payload.billingCycle) {
        const validationError = new Error(`Thiếu trường bắt buộc ở gói thứ ${index + 1}`);
        validationError.statusCode = 400;
        throw validationError;
      }

      return payload;
    });

    if (normalizedPlans.length === 0) {
      return res.status(400).json({ message: 'Thiếu dữ liệu gói thanh toán' });
    }

    const docs = await SubscriptionPlan.insertMany(normalizedPlans, { ordered: true });

    if (docs.length === 1) {
      return res.status(201).json(docs[0]);
    }

    res.status(201).json({
      message: `Đã tạo ${docs.length} gói thanh toán`,
      created: docs,
    });
  } catch (err) {
    console.error('createPlan error:', err);
    if (err?.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    if (err?.code === 11000) {
      return res.status(409).json({ message: 'planId đã tồn tại' });
    }
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