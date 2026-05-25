import mongoose from "mongoose";
import Payment from "../models/Payment.js";
import { createAudit } from "../services/audit.service.js";

const DEFAULT_LIMIT = 25;
const MAX_EXPORT_LIMIT = 5000;

const escapeCsv = (value) => {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
};

const buildFilter = (query = {}) => {
  const filter = {};
  const { status, method, q, from, to } = query;

  if (status && ["pending", "completed", "failed", "refunded"].includes(status)) {
    filter.status = status;
  }

  if (method && ["vnpay", "momo", "card"].includes(method)) {
    filter.method = method;
  }

  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) {
      const endDate = new Date(to);
      endDate.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = endDate;
    }
  }

  if (q) {
    const safeQuery = String(q).trim();
    const regex = new RegExp(safeQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [
      { transactionId: regex },
      { description: regex },
      { planId: regex },
    ];

    if (mongoose.Types.ObjectId.isValid(safeQuery)) {
      filter.$or.push({ user: new mongoose.Types.ObjectId(safeQuery) });
    }
  }

  return filter;
};

const buildSummary = async (filter) => {
  const [statusAgg, methodAgg, totalAgg] = await Promise.all([
    Payment.aggregate([
      { $match: filter },
      { $group: { _id: "$status", count: { $sum: 1 }, total: { $sum: "$amount" } } },
    ]),
    Payment.aggregate([
      { $match: filter },
      { $group: { _id: "$method", count: { $sum: 1 }, total: { $sum: "$amount" } } },
    ]),
    Payment.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          completedAmount: {
            $sum: {
              $cond: [{ $eq: ["$status", "completed"] }, "$amount", 0],
            },
          },
          refundedAmount: {
            $sum: {
              $cond: [{ $eq: ["$status", "refunded"] }, "$amount", 0],
            },
          },
          pendingAmount: {
            $sum: {
              $cond: [{ $eq: ["$status", "pending"] }, "$amount", 0],
            },
          },
          failedAmount: {
            $sum: {
              $cond: [{ $eq: ["$status", "failed"] }, "$amount", 0],
            },
          },
        },
      },
    ]),
  ]);

  const statusMap = statusAgg.reduce((acc, item) => {
    acc[item._id || "unknown"] = {
      count: item.count || 0,
      total: item.total || 0,
    };
    return acc;
  }, {});

  const methodMap = methodAgg.reduce((acc, item) => {
    acc[item._id || "unknown"] = {
      count: item.count || 0,
      total: item.total || 0,
    };
    return acc;
  }, {});

  const totals = totalAgg[0] || {};

  return {
    ...totals,
    byStatus: statusMap,
    byMethod: methodMap,
  };
};

const mapPayment = (payment) => ({
  ...payment,
  refundable: payment.status === "completed",
  refundableReason: payment.status === "completed" ? "Có thể hoàn tiền" : "Chỉ giao dịch completed mới hoàn tiền",
});

export const getAdminPayments = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
    const skip = (page - 1) * limit;
    const filter = buildFilter(req.query);

    const [items, total, summary] = await Promise.all([
      Payment.find(filter)
        .populate("user", "fullName email avatarUrl role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Payment.countDocuments(filter),
      buildSummary(filter),
    ]);

    res.json({
      items: items.map(mapPayment),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      summary,
    });
  } catch (err) {
    console.error("getAdminPayments error:", err);
    res.status(500).json({ message: "Failed to fetch payment records" });
  }
};

export const getAdminPaymentById = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate("user", "fullName email avatarUrl role")
      .lean();

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    res.json(mapPayment(payment));
  } catch (err) {
    console.error("getAdminPaymentById error:", err);
    res.status(500).json({ message: "Failed to fetch payment detail" });
  }
};

export const refundPayment = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    if (payment.status !== "completed") {
      return res.status(400).json({ message: "Only completed payments can be refunded" });
    }

    if (payment.status === "refunded") {
      return res.status(409).json({ message: "Payment has already been refunded" });
    }

    const reason = String(req.body?.reason || "Refund requested by admin").trim();
    const gatewayReference = String(req.body?.gatewayReference || `sim-${payment._id}`).trim();
    const processedAt = new Date();

    payment.status = "refunded";
    payment.refund = {
      status: "simulated",
      reason,
      requestedBy: req.user?.id || req.user?._id,
      requestedAt: processedAt,
      processedBy: req.user?.id || req.user?._id,
      processedAt,
      gatewayReference,
    };

    await payment.save();

    try {
      await createAudit(req, {
        action: "refund_payment",
        resourceType: "Payment",
        resourceId: payment._id,
        details: {
          amount: payment.amount,
          method: payment.method,
          transactionId: payment.transactionId,
          reason,
          simulated: true,
        },
      });
    } catch (auditError) {
      console.error("Audit log failed for refundPayment:", auditError);
    }

    const updated = await Payment.findById(payment._id)
      .populate("user", "fullName email avatarUrl role")
      .lean();

    res.json({
      message: "Payment refunded successfully",
      payment: mapPayment(updated),
    });
  } catch (err) {
    console.error("refundPayment error:", err);
    res.status(500).json({ message: "Failed to refund payment" });
  }
};

export const exportAdminPaymentsCsv = async (req, res) => {
  try {
    const filter = buildFilter(req.query);
    const items = await Payment.find(filter)
      .populate("user", "fullName email")
      .sort({ createdAt: -1 })
      .limit(MAX_EXPORT_LIMIT)
      .lean();

    const header = [
      "Transaction ID",
      "User Name",
      "User Email",
      "Status",
      "Method",
      "Amount",
      "Currency",
      "Plan ID",
      "Description",
      "Created At",
      "Refund Status",
      "Refund Reason",
      "Refund At",
    ];

    const rows = items.map((payment) => [
      payment.transactionId,
      payment.user?.fullName || "",
      payment.user?.email || "",
      payment.status,
      payment.method,
      payment.amount,
      payment.currency,
      payment.planId || "",
      payment.description || "",
      payment.createdAt ? new Date(payment.createdAt).toISOString() : "",
      payment.refund?.status || "none",
      payment.refund?.reason || "",
      payment.refund?.processedAt ? new Date(payment.refund.processedAt).toISOString() : "",
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=payments-${Date.now()}.csv`);
    res.send(`\ufeff${csv}`);
  } catch (err) {
    console.error("exportAdminPaymentsCsv error:", err);
    res.status(500).json({ message: "Failed to export payments" });
  }
};