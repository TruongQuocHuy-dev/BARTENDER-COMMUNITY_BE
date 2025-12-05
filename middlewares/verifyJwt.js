import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "bartender_secret";

export default function verifyJwt(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.warn("❌ No token provided");
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    next();
  } catch (err) {
    console.error("❌ JWT verify error:", err.message, "token:", token);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
