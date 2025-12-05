import User from "../models/User.js";
import Device from "../models/Device.js";
import SecuritySettings from "../models/Securitys.js";
import geoip from "geoip-lite";
import bcrypt from "bcryptjs";

export const getSecuritySettings = async (req, res) => {
  try {
    let settings = await SecuritySettings.findOne({ user: req.user._id }); // Nếu user chưa có settings, ta tạo một object rỗng // (Logic cũ của bạn đã tốt, giữ nguyên)

    if (!settings) {
      // Thêm: Lấy email/phone từ User model làm fallback
      const user = await User.findById(req.user._id).select("email phone");
      settings = await SecuritySettings.create({
        user: req.user._id,
        recoveryEmail: user?.email,
        recoveryPhone: user?.phone,
      });
    } // ❗SỬA LỖI: Ánh xạ (map) dữ liệu "phẳng" từ DB // sang định dạng "lồng nhau" mà FE mong muốn

    const responseData = {
      twoFactorAuth: {
        enabled: settings.twoFactorEnabled ?? false,
        method: settings.twoFactorMethod ?? null,
        phone: settings.twoFactorPhone ?? null, // (Giả sử bạn có trường này)
      },
      securityAlerts: {
        // Dùng ?? true để bật mặc định cho user mới
        unusualActivity: settings.securityAlerts?.unusualActivity ?? true,
        newDeviceLogin: settings.securityAlerts?.newDeviceLogin ?? true,
        passwordChange: settings.securityAlerts?.passwordChange ?? true,
        emailChange: settings.securityAlerts?.emailChange ?? true,
      },
      recoveryEmail: settings.recoveryEmail ?? null,
      recoveryPhone: settings.recoveryPhone ?? null,
      hasRecoveryCodes: !!settings.hasRecoveryCodes,
    };

    res.json(responseData);
  } catch (err) {
    console.error("getSecuritySettings error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ HÀM 2: SỬA LẠI updateSecuritySettings
export const updateSecuritySettings = async (req, res) => {
  try {
    const nestedUpdates = req.body; // e.g., { twoFactorAuth: { enabled: true } } // ❗SỬA LỖI: "Làm phẳng" (flatten) dữ liệu từ FE // để lưu chính xác vào DB

    const flatUpdates = {}; // 1. Xử lý twoFactorAuth

    if (nestedUpdates.twoFactorAuth) {
      // Chỉ cập nhật các trường được gửi lên
      if (nestedUpdates.twoFactorAuth.enabled !== undefined) {
        flatUpdates.twoFactorEnabled = nestedUpdates.twoFactorAuth.enabled;
      }
      if (nestedUpdates.twoFactorAuth.method !== undefined) {
        flatUpdates.twoFactorMethod = nestedUpdates.twoFactorAuth.method;
      }
      if (nestedUpdates.twoFactorAuth.phone !== undefined) {
        flatUpdates.twoFactorPhone = nestedUpdates.twoFactorAuth.phone;
      }
    } // 2. Xử lý securityAlerts (dùng Mongoose dot notation)

    if (nestedUpdates.securityAlerts) {
      for (const [key, value] of Object.entries(nestedUpdates.securityAlerts)) {
        if (value !== undefined) {
          flatUpdates[`securityAlerts.${key}`] = value;
        }
      }
    } // 3. Xử lý các trường gốc khác

    if (nestedUpdates.recoveryEmail !== undefined) {
      flatUpdates.recoveryEmail = nestedUpdates.recoveryEmail;
    }
    if (nestedUpdates.recoveryPhone !== undefined) {
      flatUpdates.recoveryPhone = nestedUpdates.recoveryPhone;
    } // Cập nhật DB với dữ liệu đã được làm phẳng

    const updatedSettings = await SecuritySettings.findOneAndUpdate(
      { user: req.user._id },
      { $set: flatUpdates },
      { new: true, upsert: true } // new: true trả về doc đã update
    ); // ❗SỬA LỖI: Trả về response ĐÃ ĐƯỢC ÁNH XẠ (mapped) // (Giống hệt logic trong getSecuritySettings)

    const responseData = {
      twoFactorAuth: {
        enabled: updatedSettings.twoFactorEnabled ?? false,
        method: updatedSettings.twoFactorMethod ?? null,
        phone: updatedSettings.twoFactorPhone ?? null,
      },
      securityAlerts: updatedSettings.securityAlerts, // (Mongoose sẽ trả về object lồng nhau)
      recoveryEmail: updatedSettings.recoveryEmail,
      recoveryPhone: updatedSettings.recoveryPhone,
      hasRecoveryCodes: !!updatedSettings.hasRecoveryCodes,
    };

    res.json(responseData);
  } catch (err) {
    console.error("updateSecuritySettings error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* --- Devices --- */
export const getDevices = async (req, res) => {
  try {
    const devices = await Device.find({ user: req.user._id }).sort({
      lastActive: -1,
    });
    res.json(devices);
  } catch (err) {
    console.error("getDevices error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const logoutDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const deleted = await Device.findOneAndDelete({
      _id: deviceId,
      user: req.user._id,
    });
    if (!deleted) return res.status(404).json({ message: "Device not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("logoutDevice error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ❗ SỬA LỖI API 404
// FE (securityService.ts) đang gọi DELETE /api/security/devices
// Nó sẽ khớp với route này (logoutAllDevices) thay vì logoutAllOtherDevices
export const logoutAllDevices = async (req, res) => {
  try {
    // Xoá tất cả thiết bị TRỪ thiết bị 'current: true'
    await Device.deleteMany({ user: req.user._id, current: false });
    res.json({ success: true });
  } catch (err) {
    console.error("logoutAllDevices error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* --- Login history (ĐÃ XOÁ) --- */
// ❌ export const getLoginHistory = ...
// ❌ export const createLoginEvent = ...

// ✅ HÀM NỘI BỘ (trackDevice - được gọi bởi registerCurrentDevice)
// (Đã sửa để dùng uniqueId và bỏ createLoginEvent)
export const trackDevice = async (userId, deviceInfo) => {
  if (!deviceInfo.uniqueId) {
    console.error("trackDevice thiếu uniqueId");
    return null;
  }

  // Bước 1: Đặt tất cả thiết bị khác thành current: false
  await Device.updateMany(
    { user: userId, uniqueId: { $ne: deviceInfo.uniqueId } },
    { $set: { current: false } }
  );

  // Bước 2: Tìm hoặc tạo device bằng uniqueId
  let device = await Device.findOneAndUpdate(
    { user: userId, uniqueId: deviceInfo.uniqueId },
    {
      $set: {
        ...deviceInfo, // name, os, browser, ip, location
        lastActive: new Date(),
        current: true,
      },
    },
    { upsert: true, new: true } // Tạo mới nếu không thấy
  );

  // ❌ Bước 3: Đã xoá lệnh gọi createLoginEvent

  return device;
};

// ✅ HÀM CONTROLLER (API POST /api/security/devices)
// (FE gọi hàm này sau khi login)
export const registerCurrentDevice = async (req, res) => {
  try {
    const userId = req.user._id;
    // 1. Lấy thông tin từ FE (có uniqueId)
    const { uniqueId, name, os, browser } = req.body;

    if (!uniqueId) {
      return res.status(400).json({ message: "Thiếu uniqueId" });
    }

    // 2. Lấy thông tin từ Backend
    const ip = req.ip || req.socket.remoteAddress;
    const geo = geoip.lookup(ip);
    const location = geo ? `${geo.city}, ${geo.country}` : "Unknown Location";

    // 3. Trộn thông tin
    const fullDeviceInfo = {
      uniqueId,
      name,
      os,
      browser,
      ip,
      location,
    };

    // 4. Gọi hàm logic nội bộ
    const device = await trackDevice(userId, fullDeviceInfo);

    res.status(201).json(device);
  } catch (error) {
    console.error("registerCurrentDevice error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user._id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Vui lòng nhập đủ thông tin" });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ message: "Mật khẩu mới phải có ít nhất 6 ký tự" });
    }

    // 1. Lấy user và mật khẩu (quan trọng: dùng .select('+password'))
    const user = await User.findById(userId).select("+password");

    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    // 2. Kiểm tra xem user có password không (có thể họ login bằng Google)
    if (!user.password) {
      return res.status(400).json({ 
        message: "Tài khoản của bạn được tạo qua Google và không có mật khẩu. Vui lòng sử dụng chức năng 'Quên mật khẩu' để tạo mật khẩu mới." 
      });
    }

    // 3. So sánh mật khẩu cũ
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Mật khẩu hiện tại không đúng" });
    }

    // 4. So sánh mật khẩu mới không được trùng mật khẩu cũ
    const isSameAsOld = await bcrypt.compare(newPassword, user.password);
    if (isSameAsOld) {
      return res.status(400).json({ message: "Mật khẩu mới phải khác mật khẩu cũ" });
    }

    // 5. Hash và lưu mật khẩu mới
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedNewPassword;
    await user.save();

    res.json({ success: true, message: "Đổi mật khẩu thành công" });

  } catch (err) {
    console.error("changePassword error:", err);
    res.status(500).json({ message: "Lỗi máy chủ" });
  }
};