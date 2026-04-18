// controllers/payment.controller.js
import mongoose from "mongoose";
import Payment from "../models/Payment.js";
import PaymentMethod from "../models/PaymentMethod.js";
import SubscriptionPlan from "../models/SubscriptionPlan.js";
import Subscription from "../models/Subscription.js";

import {
  createVnpayPaymentUrl,
  verifyVnpaySignature,
} from "../services/vnpayService.js";
import {
  createMomoPaymentUrl,
  verifyMomoSignature,
} from "../services/momoService.js";

/**
 * @desc    Tạo một giao dịch thanh toán MỚI (FE gọi)
 * @route   POST /api/v1/payments
 * @access  Private
 */
export const createPayment = async (req, res) => {
  const { planId, paymentMethodId, description } = req.body;
  const userId = req.user.id;
  const ipAddr = "8.8.8.8"; 

  if (!planId || !paymentMethodId) {
    return res.status(400).json({ message: "Thiếu planId hoặc paymentMethodId" });
  }

  // ❌ ĐÃ XÓA: const session = await mongoose.startSession(); 

  try {
    // 1. Lấy dữ liệu (Bỏ .session(session))
    const [method, plan] = await Promise.all([
      PaymentMethod.findOne({ _id: paymentMethodId, user: userId }),
      SubscriptionPlan.findOne({ planId: planId }),
    ]);

    if (!method) throw new Error("Không tìm thấy PTTT");
    if (!plan) throw new Error("Không tìm thấy gói");

    const amount = plan.price;
    const orderDescription = description || `Nang cap ${plan.name}`;

    // 2. Làm sạch chuỗi (Giữ nguyên logic của bạn)
    const safeOrderInfo = orderDescription
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9 ]/g, " ");

    const orderId = new mongoose.Types.ObjectId();

    // 3. Tạo Payment
    const payment = new Payment({
      _id: orderId,
      transactionId: orderId.toString(),
      user: userId,
      status: "pending",
      amount: amount,
      currency: "VND",
      method: method.type,
      description: orderDescription,
      planId: plan.planId,
    });

    // 4. Lưu trực tiếp (QUAN TRỌNG: Không dùng session)
    await payment.save(); 

    let paymentUrl;
    if (method.type === "vnpay") {
      paymentUrl = createVnpayPaymentUrl({
        amount: amount,
        orderId: orderId.toString(),
        orderInfo: safeOrderInfo,
        ipAddr: ipAddr,
      });
    } else if (method.type === "momo") {
      paymentUrl = await createMomoPaymentUrl({
        amount: amount,
        orderId: orderId.toString(),
        orderInfo: safeOrderInfo,
        requestId: orderId.toString(),
      });
    } else {
      throw new Error("Loại PTTT không được hỗ trợ");
    }

    // ❌ ĐÃ XÓA: await session.commitTransaction();
    res.status(201).json({ paymentUrl: paymentUrl });

  } catch (err) {
    // ❌ ĐÃ XÓA: await session.abortTransaction();
    console.error("Lỗi createPayment:", err);
    res.status(500).json({ message: err.message || "Lỗi máy chủ" });
  }
};

/**
 * @desc    Lấy lịch sử thanh toán của user
 * @route   GET /api/v1/payments
 * @access  Private
 */
export const getMyPaymentHistory = async (req, res) => {
  try {
    const payments = await Payment.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(payments);
  } catch (err) {
    res.status(500).json({ message: "Lỗi máy chủ" });
  }
};
export const handleVnpayIpn = async (req, res) => {
  try {
    const params = req.query;
    console.log("[VNPay IPN] Received:", params);

    const isValid = verifyVnpaySignature(params);
    if (!isValid) return res.status(400).json({ RspCode: "97", Message: "Invalid Signature" });

    const orderId = params["vnp_TxnRef"];
    const vnpResponseCode = params["vnp_ResponseCode"];

    if (vnpResponseCode === "00") {
      await processSuccessfulPayment(orderId); // Gọi hàm KHÔNG session
      res.status(200).json({ RspCode: "00", Message: "Confirm Success" });
    } else {
      await Payment.updateOne({ _id: orderId, status: "pending" }, { $set: { status: "failed" } });
      res.status(200).json({ RspCode: "01", Message: "Confirm Failed" });
    }
  } catch (err) {
    console.error("Lỗi IPN VNPay:", err);
    res.status(500).json({ RspCode: "99", Message: "Internal Error" });
  }
};

export const handleMomoIpn = async (req, res) => {
  try {
    const body = req.body;
    console.log("=============================================");
    console.log("[MoMo IPN] BƯỚC 1: ĐÃ VÀO HÀM handleMomoIpn");
    console.log("[MoMo IPN] Received Body:", body);

    let isValid = false;
    try {
      console.log("[MoMo IPN] BƯỚC 2: Đang gọi verifyMomoSignature...");
      isValid = verifyMomoSignature(body); // Gọi hàm kiểm tra chữ ký
    } catch (verifyError) {
      // Bắt lỗi nếu hàm verifyMomoSignature TỰ NÓ bị crash (ví dụ: thiếu secretKey)
      console.error(
        "[MoMo IPN] LỖI NGHIÊM TRỌNG: verifyMomoSignature BỊ CRASH:",
        verifyError
      );
      return res.status(500).json({ message: "Verify Signature Error" });
    } // 👇 Log kết quả của việc kiểm tra chữ ký

    console.log(`[MoMo IPN] BƯỚC 3: Chữ ký có HỢP LỆ KHÔNG? ===> ${isValid}`);

    if (!isValid) {
      // Nếu chữ ký sai, log lỗi và dừng lại
      console.error(
        "[MoMo IPN] LỖI: CHỮ KÝ KHÔNG HỢP LỆ (Invalid Signature). Dừng lại."
      );
      return res.status(400).json({ message: "Invalid Signature" });
    } // Nếu chữ ký đúng, tiếp tục

    const orderId = body.orderId;
    const resultCode = body.resultCode;
    console.log(`[MoMo IPN] BƯỚC 4: Chữ ký HỢP LỆ. ResultCode: ${resultCode}`);

    if (resultCode === 0) {
      console.log("[MoMo IPN] BƯỚC 5: Đang gọi processSuccessfulPayment...");
      await processSuccessfulPayment(orderId);
      console.log("[MoMo IPN] BƯỚC 6: processSuccessfulPayment ĐÃ CHẠY XONG.");
      res.status(204).end();
    } else {
      console.log(
        `[MoMo IPN] Thanh toán thất bại, resultCode: ${resultCode}. Cập nhật status failed.`
      );
      await Payment.updateOne(
        { _id: orderId, status: "pending" },
        { $set: { status: "failed" } }
      );
      res.status(204).end();
    }
  } catch (err) {
    // Bắt lỗi của toàn bộ hàm handleMomoIpn
    console.error("Lỗi IPN MoMo (Block Catch Toàn cục):", err);
    res.status(500).end();
  }
};

// 👇👇👇 THÊM HÀM MỚI NÀY VÀO 👇👇👇

/**
 * @desc     Xử lý VNPAY Return URL (phía Client)
 * @route    GET /api/v1/payments/vnpay_return
 * @access   Public
 */
export const handleVnpayReturn = async (req, res) => { // 👈 Đổi thành async
  const params = req.query;
  console.log("[VNPay Return] Đã nhận redirect từ trình duyệt:", params);

  const responseCode = params.vnp_ResponseCode;
  const orderId = params.vnp_TxnRef;

  // Lấy deep link từ .env (GIỐNG HỆT MOMO)
  const deepLinkBase = process.env.MOMO_REDIRECT_URL || "bartendercommunity://payment/callback";

  if (responseCode === "00") {
    // Thanh toán thành công
    console.log(`[VNPay Return] Thành công. Bắt đầu kiểm tra chữ ký và cập nhật DB...`);

    // BƯỚC 1: KIỂM TRA CHỮ KÝ TRƯỚC KHI CẬP NHẬT (QUAN TRỌNG)
    const isValid = verifyVnpaySignature(params); // 👈 Gọi hàm check chữ ký

    if (isValid) {
      // BƯỚC 2: Chữ ký HỢP LỆ, cập nhật DB
      try {
        // Cập nhật DB. Hàm này đã có logic kiểm tra status: "pending" để tránh update 2 lần
        await processSuccessfulPayment(orderId); 
        console.log(`[VNPay Return] ✅ DB đã được cập nhật thành công cho đơn ${orderId}.`);
        
        // Redirect client về app với trạng thái thành công
        res.redirect(`${deepLinkBase}?status=success&orderId=${orderId}`);
        return;
      } catch (error) {
        console.error(`[VNPay Return] Lỗi DB khi cập nhật cho đơn ${orderId}:`, error);
        
        // Nếu DB lỗi, vẫn redirect thành công, IPN (nếu đến) sẽ xử lý lại
        res.redirect(`${deepLinkBase}?status=success&orderId=${orderId}`);
        return;
      }
    } else {
      // BƯỚC 3: Chữ ký KHÔNG HỢP LỆ
      console.error(`[VNPay Return] LỖI: Chữ ký KHÔNG HỢP LỆ. KHÔNG CẬP NHẬT DB.`);
      // Chuyển hướng về app báo lỗi chữ ký
      res.redirect(`${deepLinkBase}?status=failed&orderId=${orderId}&code=97`); // 97 là mã lỗi Invalid Signature
      return;
    }
  } else {
    // Thanh toán thất bại hoặc bị hủy (vnp_ResponseCode != "00")
    console.log(`[VNPay Return] Thanh toán thất bại cho đơn ${orderId}. Mã lỗi: ${responseCode}`);

    // Chuyển hướng về app với trạng thái thất bại
    res.redirect(`${deepLinkBase}?status=failed&orderId=${orderId}&code=${responseCode}`);
    return;
  }
};

const processSuccessfulPayment = async (orderId) => {
  // ❌ ĐÃ XÓA: session.startTransaction()
  try {
    // 1. Cập nhật Payment -> Completed
    const payment = await Payment.findOneAndUpdate(
      { _id: orderId, status: "pending" },
      { $set: { status: "completed" } },
      { new: true } // Bỏ session
    );

    if (!payment) {
      console.warn(`[Webhook] Giao dịch ${orderId} không tồn tại hoặc đã xử lý.`);
      return;
    }

    // 2. Tìm gói cước
    const plan = await SubscriptionPlan.findOne({ planId: payment.planId });
    if (!plan) throw new Error(`Không tìm thấy planId ${payment.planId}`);

    // 3. Tính ngày hết hạn
    const billingDays = plan.billingCycle === "yearly"
      ? 365
      : plan.billingCycle === "monthly"
        ? 30
        : 0;
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + billingDays);

    // 4. Cập nhật Subscription (Upsert)
    await Subscription.updateOne(
      { user: payment.user },
      {
        $set: {
          planId: plan.planId,
          tier: plan.tier,
          startDate: new Date(),
          endDate: endDate,
          autoRenew: true,
          price: plan.price,
          currency: plan.currency,
          lastPaymentId: payment._id,
        },
      },
      { upsert: true } // QUAN TRỌNG: Bỏ session
    );

    console.log(`[Webhook] ✅ ĐÃ NÂNG CẤP PREMIMUM CHO USER: ${payment.user}`);

  } catch (err) {
    console.error(`[Webhook] ❌ Lỗi xử lý DB đơn ${orderId}:`, err);
  }
};
