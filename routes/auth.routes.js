// routes/authRoutes.js
import express from "express";
import {
  registerWithEmail,
  loginWithEmail,
  loginWithGoogle,
  verifyEmail,
  forgotPassword,
  resetPassword,
  getMe,
  resendVerification,
  verifyTwoFactorLogin,
  loginWithFacebook,
} from "../controllers/auth.controller.js";
import verifyJwt from "../middlewares/verifyJwt.js";

const router = express.Router();

router.post("/register", registerWithEmail);
router.post("/login", loginWithEmail);
router.post("/google/login", loginWithGoogle);
router.post("/facebook/login", loginWithFacebook);
router.get("/verify-email", verifyEmail); // ✅ chỉ app gọi endpoint này
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/me", verifyJwt, getMe);
router.post("/resend-verification", resendVerification);
router.post('/verify-2fa-login', verifyTwoFactorLogin);

// 👇 Redirect chỉ mở app, KHÔNG verify ở đây
router.get("/redirect-verify", (req, res) => {
  const { token, email } = req.query;
  if (!token || !email) {
    return res.status(400).send("Invalid link");
  }

  const deepLink = `bartender://verify-email?token=${token}&email=${encodeURIComponent(email)}`;

  res.send(`
    <html>
      <head>
        <meta http-equiv="refresh" content="0;url=${deepLink}" />
      </head>
      <body>
        <p>Redirecting... If not, <a href="${deepLink}">click here</a></p>
      </body>
    </html>
  `);
});

// Redirect reset password deep link
router.get("/redirect-reset", (req, res) => {
  const { token, email } = req.query;
  if (!token || !email) {
    return res.status(400).send("Invalid link");
  }

  const deepLink = `bartender://reset-password?token=${token}&email=${encodeURIComponent(email)}`;

  res.send(`
    <html>
      <head>
        <meta http-equiv="refresh" content="0;url=${deepLink}" />
      </head>
      <body>
        <p>Redirecting... If not, <a href="${deepLink}">click here</a></p>
      </body>
    </html>
  `);
});

export default router;