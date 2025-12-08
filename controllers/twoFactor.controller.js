import speakeasy from "speakeasy";
import qrcode from "qrcode";
import twilio from "twilio";
import crypto from "crypto";

import SecuritySettings from "../models/Securitys.js";
import User from "../models/User.js";

// Khởi tạo Twilio (hoặc dịch vụ SMS khác)
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const APP_NAME = process.env.APP_NAME || "MyApp";

// --- 1. TẠO MÃ BÍ MẬT (CHO APP) ---
export const generateAppSecret = async (req, res) => {
  try {
    // Tìm email user để hiển thị trong app Google Auth
    const user = await User.findById(req.user._id).select("email");
    if (!user) return res.status(404).json({ message: "User not found" }); // Tạo secret mới

    const secret = speakeasy.generateSecret({
      name: `${APP_NAME} (${user.email})`,
    }); // Lưu secret (chưa kích hoạt) vào DB // !! BẢO MẬT: Bạn nên mã hóa secret.base32 trước khi lưu

    await SecuritySettings.findOneAndUpdate(
      { user: req.user._id },
      { $set: { twoFactorSecret: secret.base32 } },
      { upsert: true }
    ); // Tạo mã QR

    qrcode.toDataURL(secret.otpauth_url, (err, data_url) => {
      if (err) {
        console.error("QR Code generation error:", err);
        return res.status(500).json({ message: "Failed to generate QR code" });
      } // Trả về secret (để user nhập tay) và QR code (để quét)
      res.json({
        secret: secret.base32,
        qrCodeDataUrl: data_url,
      });
    });
  } catch (err) {
    console.error("generateAppSecret error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// --- 2. GỬI MÃ XÁC THỰC QUA SMS ---
export const sendSmsCode = async (req, res) => {
  try {
    // 1. Lấy SĐT từ profile của User
    const user = await User.findById(req.user._id).select("phone");
    if (!user || !user.phone) {
      return res
        .status(400)
        .json({ message: "User profile has no phone number" });
    }

    // 2. Tạo mã 6 số ngẫu nhiên
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // 3. Lưu mã vào Database (BẮT BUỘC ĐỂ BƯỚC VERIFY HOẠT ĐỘNG)
    await SecuritySettings.findOneAndUpdate(
      { user: req.user._id },
      {
        $set: {
          twoFactorTempCode: code,
          twoFactorTempCodeExpires: new Date(Date.now() + 1000 * 60 * 5), // Hết hạn sau 5 phút
        },
      },
      { upsert: true }
    );

    // ---------------------------------------------------------------
    // 🔴 MOCK SMS MODE (THAY VÌ GỬI TWILIO, TA LOG RA MÀN HÌNH)
    // ---------------------------------------------------------------
    console.log("\n==================================================");
    console.log("📱 [MOCK SMS SERVER] Đang gửi tin nhắn...");
    console.log(`📩 Tới số: ${user.phone}`);
    console.log(`🔑 MÃ OTP CỦA BẠN LÀ:  👉  ${code}  👈`);
    console.log("==================================================\n");

    // 4. Giả vờ trả về thành công cho App (App sẽ tưởng là đã gửi thật)
    res.json({
      success: true,
      message: "Verification code sent to your phone (Check Console)",
    });

  } catch (err) {
    console.error("sendSmsCode error:", err);
    res.status(500).json({ message: "Failed to send SMS" });
  }
};

// --- 3. XÁC MINH VÀ KÍCH HOẠT 2FA ---
export const verifyAndEnable = async (req, res) => {
  try {
    const { method, code } = req.body; // method: 'app' | 'sms', code: '123456'
    if (!method || !code) {
      return res.status(400).json({ message: "Method and code are required" });
    }

    const settings = await SecuritySettings.findOne({ user: req.user._id });
    if (!settings) {
      return res.status(404).json({ message: "Security settings not found" });
    }

    let isVerified = false;

    if (method === "app") {
      if (!settings.twoFactorSecret) {
        return res.status(400).json({ message: "No secret generated" });
      }
      isVerified = speakeasy.totp.verify({
        secret: settings.twoFactorSecret,
        encoding: "base32",
        token: code,
        window: 1, // Cho phép sai lệch 1 bước (30s)
      });
    } else if (method === "sms") {
      if (
        settings.twoFactorTempCode === code &&
        settings.twoFactorTempCodeExpires > new Date()
      ) {
        isVerified = true;
      }
    }

    if (!isVerified) {
      return res.status(400).json({ message: "Invalid verification code" });
    } // --- Kích hoạt thành công --- // 1. Tạo mã dự phòng

    const backupCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString("hex").toUpperCase()
    ); // 2. Lấy SĐT (nếu là SMS)

    let userPhone = null;
    if (method === "sms") {
      const user = await User.findById(req.user._id).select("phone");
      userPhone = user.phone;
    } // 3. Cập nhật DB
    await SecuritySettings.updateOne(
      { user: req.user._id },
      {
        $set: {
          twoFactorEnabled: true,
          twoFactorMethod: method,
          twoFactorPhoneNumber: userPhone,
          twoFactorBackupCodes: backupCodes, // Lưu mã dự phòng // Xóa các trường tạm
          twoFactorTempCode: null,
          twoFactorTempCodeExpires: null,
        },
      }
    ); // 4. Trả về mã dự phòng cho FE

    res.json({ success: true, backupCodes });
  } catch (err) {
    console.error("verifyAndEnable error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// --- 4. VÔ HIỆU HÓA 2FA ---
export const disable = async (req, res) => {
  try {
    await SecuritySettings.findOneAndUpdate(
      { user: req.user._id },
      {
        $set: {
          twoFactorEnabled: false,
          twoFactorMethod: null,
          twoFactorSecret: null,
          twoFactorPhoneNumber: null,
          twoFactorBackupCodes: [],
          twoFactorTempCode: null,
          twoFactorTempCodeExpires: null,
        },
      },
      { upsert: true }
    );
    res.json({ success: true, message: "Two-factor authentication disabled" });
  } catch (err) {
    console.error("disable 2FA error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
