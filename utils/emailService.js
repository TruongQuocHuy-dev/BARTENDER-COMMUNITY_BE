import dotenv from "dotenv";
dotenv.config();
import emailjs from "@emailjs/nodejs";

export const sendMail = async ({ to, subject, html, text }) => {
  // Chuẩn bị dữ liệu gửi lên Template bạn vừa tạo
  const templateParams = {
    to_email: to,          // Map vào biến {{to_email}}
    subject: subject,      // Map vào biến {{subject}}
    message: html || text, // Map vào biến {{{message}}}
  };

  try {
    const response = await emailjs.send(
      process.env.EMAILJS_SERVICE_ID,
      process.env.EMAILJS_TEMPLATE_ID,
      templateParams,
      {
        publicKey: process.env.EMAILJS_PUBLIC_KEY,
        privateKey: process.env.EMAILJS_PRIVATE_KEY,
      }
    );

    console.log("✅ Email sent via EmailJS:", response.text);
    return response;
  } catch (error) {
    console.error("❌ EmailJS Failed:", error);
    throw error;
  }
};