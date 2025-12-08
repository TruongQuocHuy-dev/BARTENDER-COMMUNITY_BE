import dotenv from "dotenv";
// Đảm bảo load biến môi trường trước khi dùng
dotenv.config(); 

import nodemailer from "nodemailer";

// Cấu hình Transporter tối ưu cho Gmail trên Railway
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465, // KHUYÊN DÙNG: Port 465 (SSL) ổn định hơn 587 trên Cloud
  secure: true, // Bắt buộc là true khi dùng port 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS, // Đây phải là Google App Password
  },
  // Thêm các options này để tránh treo kết nối quá lâu nếu mạng lag
  connectionTimeout: 10000, // 10 giây
  greetingTimeout: 10000,   // 10 giây
  socketTimeout: 10000,     // 10 giây
});

// Hàm kiểm tra kết nối (Optional - giúp debug lúc khởi động server)
transporter.verify((error, success) => {
  if (error) {
    console.error("🔴 Lỗi kết nối Mail Server:", error.message);
  } else {
    console.log("🟢 Server đã sẵn sàng gửi mail");
  }
});

export const sendMail = async ({ to, subject, html, text }) => {
  try {
    const info = await transporter.sendMail({
      from: `"Bartender Community" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`, // Thêm tên hiển thị cho chuyên nghiệp
      to,
      subject,
      text,
      html,
    });
    
    console.log("✅ Mail sent successfully:", info.messageId);
    return info;
  } catch (error) {
    console.error("❌ Send mail failed:", error);
    // Ném lỗi ra ngoài để Controller/Frontend biết là gửi thất bại
    throw error; 
  }
};