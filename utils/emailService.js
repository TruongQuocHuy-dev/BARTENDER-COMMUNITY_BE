import dotenv from "dotenv";
dotenv.config();
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendMail = async ({ to, subject, html, text }) => {
  try {
    const data = await resend.emails.send({
      from: process.env.EMAIL_FROM || "onboarding@resend.dev", // Default for testing
      to,
      subject,
      html,
      text,
    });

    console.log("✅ Mail sent:", data);
    return data;
  } catch (error) {
    console.error("❌ Send mail error:", error);
    throw error;
  }
};
