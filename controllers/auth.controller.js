// controllers/authController.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import User from "../models/User.js";
import { sendMail } from "../utils/emailService.js";

import SecuritySettings from "../models/Securitys.js";
import speakeasy from "speakeasy";
import twilio from "twilio";
import Securitys from "../models/Securitys.js";

const JWT_SECRET = process.env.JWT_SECRET || "bartender_secret";
const JWT_EXPIRES = "7d";
const client = new OAuth2Client(process.env.GOOGLE_WEB_CLIENT_ID);

const simpleUserPopulation = {
  path: "blockedUsers",
  select: "fullName avatarUrl _id", // Chỉ lấy các trường cần cho SimpleUser
};

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Helper: sign token
const signToken = (user) =>
  jwt.sign(
    { userId: user._id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

export const registerWithEmail = async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const expires = Date.now() + 1000 * 60 * 5; // 5 phút

    user = await User.create({
      fullName,
      email,
      password: hashed,
      isVerified: false,
      verificationToken,
      verificationTokenExpires: expires,
    });

    const verifyLink = `${
      process.env.API_BASE_URL
    }/api/auth/redirect-verify?token=${verificationToken}&email=${encodeURIComponent(
      email
    )}`;

    await sendMail({
      to: email,
      subject: "Verify your Bartender Community account",
      html: `
        <h2>Welcome to Bartender Community 🍹</h2>
        <p>Hello <b>${fullName}</b>,</p>
        <p>Please verify your account (valid for 5 minutes):</p>
        <p><a href="${verifyLink}" target="_blank">Verify my account</a></p>
      `,
    });

    res.status(201).json({
      success: true,
      message: "User created. Verification email sent.",
      email,
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: err.message });
  }
};

export const loginWithEmail = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Missing email or password" });

    const user = await User.findOne({ email }).populate(simpleUserPopulation);
    if (!user || !user.password)
      return res.status(400).json({ message: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Invalid credentials" });

    if (!user.isVerified) {
      return res.status(403).json({ message: "Please verify your email" });
    }
    const settings = await Securitys.findOne({ user: user._id });
    if (settings && settings.twoFactorEnabled) {
      // Nếu 2FA được bật, không trả token vội

      // Nếu là SMS, gửi mã code
      if (settings.twoFactorMethod === "sms") {
        const userWithPhone = await User.findById(user._id).select("phone");
        if (!userWithPhone.phone) {
          return res
            .status(500)
            .json({ message: "2FA enabled but no phone number found" });
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        settings.twoFactorTempCode = code;
        settings.twoFactorTempCodeExpires = new Date(
          Date.now() + 1000 * 60 * 5
        ); // 5 phút
        await settings.save();
       try {
        console.log("\n========================================");
          console.log(`📱 [MOCK LOGIN SMS] Gửi tới: ${userWithPhone.phone}`);
          console.log(`🔑 MÃ ĐĂNG NHẬP 2FA LÀ:  👉  ${code}  👈`);
          console.log("========================================\n");

        } catch (smsError) {
          console.error("Login 2FA SMS error:", smsError);
          return res.status(500).json({ message: "Failed to send 2FA SMS code" });
        }
      } // Trả về lỗi 403 đặc biệt để FE biết cần hỏi 2FA
      return res.status(403).json({
        message: "2FA required",
        twoFactorRequired: true,
        method: settings.twoFactorMethod,
        userId: user._id, // Gửi userId để FE dùng cho bước xác thực
      });
    } // --- KẾT THÚC KIỂM TRA 2FA --- // Nếu 2FA không bật, đăng nhập như bình thường
    const populatedUser = await User.findById(user._id).populate(
      simpleUserPopulation
    );
    const token = signToken(populatedUser);

    res.json({ token, user });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ BƯỚC 3: Thêm hàm mới để xác thực mã 2FA
export const verifyTwoFactorLogin = async (req, res) => {
  try {
    const { userId, code } = req.body;
    if (!userId || !code) {
      return res.status(400).json({ message: "User ID and code are required" });
    }

    const settings = await SecuritySettings.findOne({ user: userId });
    if (!settings || !settings.twoFactorEnabled) {
      return res
        .status(400)
        .json({ message: "2FA is not enabled for this user" });
    }

    let isVerified = false;

    if (settings.twoFactorMethod === "app") {
      isVerified = speakeasy.totp.verify({
        secret: settings.twoFactorSecret,
        encoding: "base32",
        token: code,
        window: 1,
      });
    } else if (settings.twoFactorMethod === "sms") {
      if (
        settings.twoFactorTempCode === code &&
        settings.twoFactorTempCodeExpires > new Date()
      ) {
        isVerified = true; // Xóa mã tạm sau khi dùng
        settings.twoFactorTempCode = undefined;
        settings.twoFactorTempCodeExpires = undefined;
        await settings.save();
      }
    }

    if (!isVerified) {
      return res.status(400).json({ message: "Invalid verification code" });
    } // --- Xác thực thành công --- // Lấy đầy đủ thông tin user và tạo token

    const user = await User.findById(userId).populate(simpleUserPopulation);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const token = signToken(user);
    res.json({ token, user });
  } catch (err) {
    console.error("verifyTwoFactorLogin error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const loginWithGoogle = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ message: "Missing idToken" });

    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_WEB_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload?.email) {
      return res.status(401).json({ message: "Invalid Google token" });
    }

    // 1. TÌM USER BẰNG EMAIL
    let user = await User.findOne({ email: payload.email });

    // 2. NẾU USER KHÔNG TỒN TẠI -> TẠO MỚI
    if (!user) {
      console.log(`[Google Login] New user, creating: ${payload.email}`);
      user = new User({
        email: payload.email,
        fullName: payload.name,     // Lấy 'name' từ Google payload
        avatarUrl: payload.picture,  // Lấy 'picture' từ Google payload
        isVerified: true,           // Tự động xác thực vì login qua Google
        // Không cần password vì họ dùng Google
      });
      await user.save();
      console.log(`[Google Login] Created new user with ID: ${user._id}`);
    }

    // 3. POPULATE VÀ TẠO TOKEN (user đã tồn tại hoặc vừa được tạo)
    // Cần populate lại user (dù là tìm thấy hay mới tạo) để đảm bảo có 'blockedUsers'
    const populatedUser = await User.findById(user._id).populate(
      simpleUserPopulation
    );

    if (!populatedUser) {
       // Trường hợp hiếm gặp: user bị xóa ngay sau khi tạo
       return res.status(404).json({ message: "User not found after operation" });
    }

    const token = signToken(populatedUser);
    
    // Trả về user đã được populate đầy đủ
    res.json({ token, user: populatedUser });

  } catch (err) {
    console.error("Google login error:", err);
    // Trả về lỗi 500 thay vì 401 nếu lỗi là do server (ví dụ: save() thất bại)
    res.status(500).json({ message: "Internal server error during Google login" });
  }
};

export const loginWithFacebook = async (req, res) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken) {
      return res.status(400).json({ message: "Thiếu Facebook Access Token" });
    }

    // 1. Gọi Graph API với picture.type(large) để lấy ảnh to, rõ nét
    // Cú pháp: picture.width(500).height(500) hoặc picture.type(large)
    const fbUrl = `https://graph.facebook.com/me?fields=id,name,email,picture.width(500).height(500)&access_token=${accessToken}`;
    
    const fbRes = await fetch(fbUrl);
    const fbData = await fbRes.json();

    if (fbData.error) {
      console.error("Facebook API Error:", fbData.error);
      return res.status(401).json({ message: "Token Facebook không hợp lệ hoặc hết hạn" });
    }

    const { id: facebookId, email, name, picture } = fbData;
    
    // Lấy đường dẫn ảnh từ cấu trúc JSON của FB
    const avatarUrl = picture?.data?.url || "";

    console.log(`[Facebook Login] User: ${name}, Avatar: ${avatarUrl}`);

    // 2. Tìm User trong DB (ưu tiên facebookId, sau đó đến email)
    let user = await User.findOne({
      $or: [
        { facebookId: facebookId },
        { email: email } 
      ]
    });

    // 3. Nếu chưa có user -> Tạo mới
    if (!user) {
      // FB có thể không trả về email (nếu đk bằng SĐT), ta tạo email giả định
      const newEmail = email || `${facebookId}@facebook.local`; 
      
      user = new User({
        fullName: name,
        email: newEmail,
        facebookId: facebookId,
        avatarUrl: avatarUrl, // Lưu avatar vào đây
        isVerified: true,
        password: "", // Không có pass
      });
      await user.save();
    } else {
      // Nếu user đã tồn tại:
      // Cập nhật facebookId nếu chưa có
      let needSave = false;
      if (!user.facebookId) {
        user.facebookId = facebookId;
        needSave = true;
      }
      // Cập nhật avatar nếu user chưa có avatar (hoặc muốn luôn cập nhật thì bỏ dòng if)
      if (!user.avatarUrl && avatarUrl) {
        user.avatarUrl = avatarUrl;
        needSave = true;
      }
      
      if (needSave) await user.save();
    }

    // 4. Populate và trả Token
    const populatedUser = await User.findById(user._id).populate(simpleUserPopulation);
    const token = signToken(populatedUser);

    res.json({ token, user: populatedUser });

  } catch (err) {
    console.error("Facebook login error:", err);
    res.status(500).json({ message: "Lỗi server khi đăng nhập Facebook" });
  }
};

export const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Missing email" });

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "Email already verified" });
    }

    const verificationToken = crypto.randomBytes(32).toString("hex");
    user.verificationToken = verificationToken;
    await user.save();

    const verifyLink = `${
      process.env.API_BASE_URL
    }/api/auth/redirect-verify?token=${verificationToken}&email=${encodeURIComponent(
      email
    )}`;

    await sendMail({
      to: email,
      subject: "Resend - Verify your Bartender Community account",
      html: `
        <h2>Bartender Community 🍹</h2>
        <p>Hello <b>${user.fullName}</b>,</p>
        <p>Click below to verify your account:</p>
        <p><a href="${verifyLink}" target="_blank">Verify my account</a></p>
      `,
    });

    res.json({ success: true, message: "Verification email resent." });
  } catch (err) {
    console.error("Resend verification error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const verifyEmail = async (req, res) => {
  try {
    const { token, email } = req.query;
    if (!token || !email) {
      return res.status(400).json({ success: false, message: "Invalid link" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "User not found" });
    }

    if (user.isVerified) {
      return res.json({
        success: true,
        message: "Email already verified",
        user: {
          id: user._id,
          email: user.email,
          fullName: user.fullName,
          avatarUrl: user.avatarUrl,
          isVerified: true,
        },
      });
    }

    if (
      user.verificationToken !== token ||
      !user.verificationTokenExpires ||
      user.verificationTokenExpires < Date.now()
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired token" });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();

    return res.json({
      success: true,
      message: "Email verified successfully",
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        isVerified: true,
      },
    });
  } catch (err) {
    console.error("Verify Email error:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Missing email" });

    const user = await User.findOne({ email });
    if (!user)
      return res
        .status(200)
        .json({ message: "If the email exists, reset instructions were sent" });

    const token = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 1000 * 60 * 60; // 1 hour
    await user.save();

    const resetUrl = `${
      process.env.API_BASE_URL
    }/api/auth/redirect-reset?token=${token}&email=${encodeURIComponent(
      email
    )}`;

    await sendMail({
      to: email,
      subject: "Password reset instructions",
      html: `<p>Click below to reset your password (valid for 1 hour):</p>
             <p><a href="${resetUrl}">Reset password</a></p>`,
    });

    res.json({ message: "If the email exists, reset instructions were sent" });
  } catch (err) {
    console.error("forgotPassword error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;
    if (!email || !token || !newPassword)
      return res.status(400).json({ message: "Missing fields" });

    const user = await User.findOne({
      email,
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user)
      return res.status(400).json({ message: "Invalid or expired token" });

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("resetPassword error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getMe = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(req.user._id)
      .select("-password -resetPasswordToken -verificationToken")
      .populate(simpleUserPopulation);

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (err) {
    console.error("getMe error:", err);
    res.status(500).json({ message: "Failed to fetch user profile" });
  }
};
