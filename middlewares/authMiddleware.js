import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { attachRoleContext } from "../services/role.service.js";

const JWT_SECRET = process.env.JWT_SECRET || "bartender_secret";

// Middleware bảo vệ route
export const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, JWT_SECRET);

      const user = await User.findById(decoded.userId).select("-password");
      if (!user) return res.status(401).json({ message: "User not found" });

      req.user = await attachRoleContext(user);

      return next();
    } catch (err) {
      console.error("Auth error:", err);
      return res.status(401).json({ message: "Not authorized, token failed" });
    }
  }
  return res.status(401).json({ message: "Not authorized, no token" });
};

// Check role = 'admin'
export const isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin only" });
  }
  next();
};

// Check flag isAdmin = true
export const adminOnly = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ message: "Admin only" });
  }
  next();
};

/**
 * Xác thực TÙY CHỌN (Optional Authentication)
 * Nếu có token hợp lệ -> gán req.user
 * Nếu không có token hoặc token sai -> bỏ qua, req.user sẽ là undefined
 */
export const optionalAuth = async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, JWT_SECRET);

      const user = await User.findById(decoded.userId).select("-password");
      if (user) {
        req.user = await attachRoleContext(user);
      }
    } catch (err) {
      // Token không hợp lệ, không làm gì cả, cứ tiếp tục
      console.warn('Optional auth: Invalid token provided. Proceeding as guest.');
    }
  }
  
  // Luôn luôn gọi next()
  next();
};