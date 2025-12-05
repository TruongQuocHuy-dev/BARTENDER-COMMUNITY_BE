import axios from 'axios';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Sử dụng model Flash cho nhanh và rẻ
const GEMINI_MODEL = "gemini-2.0-flash-001"; 

export const checkContentWithGemini = async (text) => {
  const filterPrompt = `
    Bạn là một AI kiểm duyệt nội dung cho ứng dụng cộng đồng.
    Nhiệm vụ: Kiểm tra văn bản sau xem có vi phạm tiêu chuẩn cộng đồng không.
    
    Các tiêu chí vi phạm:
    1. Chửi thề, tục tĩu (Tiếng Việt/Anh, kể cả viết tắt như vcl, đm...)
    2. Ngôn từ thù ghét, xúc phạm cá nhân
    3. Nội dung 18+ hoặc bạo lực
    4. Spam/Quảng cáo
    
    Văn bản cần kiểm tra: "${text}"
    
    Yêu cầu trả về: CHỈ trả về một chuỗi JSON duy nhất (không markdown, không giải thích thêm) với định dạng:
    {
      "isSafe": boolean, 
      "reason": "Lý do ngắn gọn bằng tiếng Việt nếu vi phạm, hoặc null nếu an toàn"
    }
  `;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: filterPrompt }] }]
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    // Lấy text trả về từ Gemini
    let rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
       // Nếu không có phản hồi, mặc định cho qua để không chặn nhầm
       return { isSafe: true, reason: null };
    }

    // Làm sạch chuỗi JSON (đề phòng Gemini trả về dạng ```json ... ```)
    rawText = rawText.replace(/```json|```/g, "").trim();

    // Parse sang Object
    return JSON.parse(rawText);

  } catch (error) {
    console.error("Lỗi khi kiểm duyệt nội dung:", error.message);
    // Fail-open: Nếu lỗi API, tạm thời cho phép (để không chặn user oan vì lỗi hệ thống)
    return { isSafe: true, reason: null };
  }
};