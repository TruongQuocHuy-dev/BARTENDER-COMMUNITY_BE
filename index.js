import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import { connectDB } from "./utils/connectDB.js";
import authRoutes from "./routes/auth.routes.js";
import recipeRoutes from "./routes/recipe.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import commentRoutes from "./routes/comment.routes.js";
import bannerRoutes from "./routes/banner.routes.js";
import postRoutes from "./routes/post.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import userRoutes from "./routes/user.routes.js";
import chatbotRoutes from "./routes/chatbot.routes.js";
import { protect } from "./middlewares/authMiddleware.js";
import securityRoutes from "./routes/security.routes.js";
import reviewRoutes from "./routes/review.routes.js";
import messageRoutes from "./routes/message.routes.js";
import reportRoutes from "./routes/report.routes.js";
import subscriptionPlanRoutes from "./routes/subscription-plan.routes.js";
import subscriptionRoutes from "./routes/subscription.routes.js";
import paymentMethodRoutes from "./routes/payment-method.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import {
  handleVnpayIpn,
  handleMomoIpn,
  handleVnpayReturn,
} from "./controllers/payment.controller.js";
import settingsRoutes from "./routes/notification.routes.js";
import activityRoutes from "./routes/activity.routes.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.originalUrl}`);
  console.log("Headers:", req.headers);
  if (req.headers["content-type"]?.includes("multipart/form-data")) {
    console.log("Body: [Multipart Form Data]");
  } else {
    console.log("Body:", req.body);
  }
  next();
});

// Handle json parsing errors
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res
      .status(400)
      .json({ message: "Invalid JSON", error: err.message });
  }
  next(err);
});

// Test route
app.get("/", (req, res) => {
  // 1. Thêm log này
  console.log("====== TEST CODE MỚI: Server đang chạy code mới nhất! ====="); // 2. Thêm (v2) vào
  res.send("🍸 Bartender API running... (v2)");
});

console.log(
  "====== TEST v6: Đang đăng ký IPN routes (PUBLIC) trong index.js ====="
);
app.get("/api/v1/payments/ipn/vnpay", handleVnpayIpn);
app.post("/api/v1/payments/ipn/momo", handleMomoIpn);
app.get("/api/v1/payments/vnpay_return", handleVnpayReturn);

connectDB();

const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));

const HOST = "0.0.0.0";
// Import error handler
import { errorHandler } from "./middlewares/errorMiddleware.js";

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/recipes", recipeRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api", commentRoutes);
app.use("/api/banners", bannerRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);
app.use("/api/v1/chat", chatbotRoutes);
app.use("/api/security", securityRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api", postRoutes);
app.use("/api", messageRoutes);
app.use("/api", reportRoutes);
app.use("/api/v1/subscription-plans", subscriptionPlanRoutes);
app.use("/api/v1/me/subscription", subscriptionRoutes);
app.use("/api/v1/payment-methods", paymentMethodRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/activities", activityRoutes);
// Error handling middleware (must be after all routes)
app.use(errorHandler);

app.listen(PORT, HOST, () =>
  console.log(`🚀 Server running on http://${HOST}:${PORT}`)
);
app.use("/api/comments", commentRoutes);
app.use("/api/banners", bannerRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/recipes", recipeRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/chatbot", chatbotRoutes);
app.use("/api/security", securityRoutes);
app.get("/me", protect, (req, res) => {
  res.json(req.user);
});

// app.use('/api/reviews', reviewRoutes);
