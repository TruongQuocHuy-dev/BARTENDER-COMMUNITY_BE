import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import { connectDB } from "./utils/connectDB.js";

// Import Routes
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

import { protect } from "./middlewares/authMiddleware.js";
import { errorHandler } from "./middlewares/errorMiddleware.js";

const app = express();
app.use(cors());
app.use(express.json());

// Log middleware
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.originalUrl}`);
  next();
});

// Root test route
app.get("/", (req, res) => {
  res.send("🍸 Bartender API running on Render (OK)");
});

/* ------------------------------ PAYMENT IPN ------------------------------ */
app.get("/api/v1/payments/ipn/vnpay", handleVnpayIpn);
app.post("/api/v1/payments/ipn/momo", handleMomoIpn);
app.get("/api/v1/payments/vnpay_return", handleVnpayReturn);

/* ------------------------------- API ROUTES ------------------------------ */
app.use("/api/auth", authRoutes);
app.use("/api/recipes", recipeRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/banners", bannerRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chatbot", chatbotRoutes);
app.use("/api/security", securityRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/v1/subscription-plans", subscriptionPlanRoutes);
app.use("/api/v1/me/subscription", subscriptionRoutes);
app.use("/api/v1/payment-methods", paymentMethodRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/activities", activityRoutes);

// Protected test route
app.get("/me", protect, (req, res) => {
  res.json(req.user);
});

// Error handler always last
app.use(errorHandler);

/* ----------------------------- START SERVER ------------------------------ */
connectDB();

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
});
