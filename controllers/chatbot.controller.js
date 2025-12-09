import axios from 'axios';
import Recipe from '../models/Recipe.js';
import Subscription from '../models/Subscription.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash"; 

// 1. PERSONA & PROMPTS (CẬP NHẬT: DÙNG IN HOA THAY VÌ DẤU SAO)
const BARTENDER_PERSONA = `
Bạn là "BarBuddy" - Trợ lý AI Bartender.
- Phong cách: Thân thiện, dùng emoji 🍸, xưng "mình" - "bạn".
- NGÔN NGỮ: BẮT BUỘC TRẢ LỜI 100% BẰNG TIẾNG VIỆT.
- FORMAT TRÌNH BÀY (QUAN TRỌNG):
  1. TUYỆT ĐỐI KHÔNG dùng ký tự dấu sao (*) để in đậm.
  2. Để nhấn mạnh TÊN MÓN ĂN và CÁC TIÊU ĐỀ CHÍNH, hãy VIẾT IN HOA TOÀN BỘ (Ví dụ: MOJITO, NGUYÊN LIỆU, CÁCH LÀM).
  3. Dùng gạch đầu dòng (-) cho danh sách.
`;

// Hàm helper để làm sạch dấu sao nếu AI lỡ tạo ra
const cleanResponse = (text) => {
  if (!text) return "";
  return text.replace(/\*\*/g, '').replace(/\*/g, '-'); // Xóa ** và đổi * thành -
};

const classifyUserIntent = async (message) => {
  const prompt = `Phân loại câu: "${message}". Trả về 1 từ khóa: "find_recipe" (nếu tìm công thức), "greeting" (chào hỏi), hoặc "chat".`;
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { headers: { 'Content-Type': 'application/json' } }
    );
    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const intent = text.trim().toLowerCase();
    if (intent.includes("find_recipe")) return "find_recipe";
    if (intent.includes("greeting")) return "greeting";
    return "chat";
  } catch (e) { return "chat"; }
}

const checkUserPremiumStatus = async (userId) => {
  if (!userId) return false;
  try {
    const sub = await Subscription.findOne({ user: userId, tier: 'premium', endDate: { $gt: new Date() } });
    return !!sub;
  } catch (error) { return false; }
}

// === CONTROLLER CHÍNH ===
export const handleChat = async (req, res) => {
  const { message, history = [] } = req.body;
  const userId = req.user?._id;

  try {
    const intent = await classifyUserIntent(message);
    
    let finalResponse = {
      text_response: "Xin lỗi, mình đang lơ đễnh chút. Bạn nói lại được không? 🍸",
      recipe_card: null,
      suggested_actions: []
    };

    // --- CASE 0: CHÀO HỎI ---
    if (intent === "greeting") {
      return res.json({
        text_response: "Chào bạn! Mình là BARBUDDY 🍸. Mình có thể giúp bạn tìm công thức cocktail hoặc giải đáp thắc mắc về pha chế. Bạn muốn uống gì hôm nay?",
        suggested_actions: ["Công thức Mojito", "Món cocktail Rum", "Kiến thức về Gin"],
        recipe_card: null
      });
    }

    // --- CASE 1: TÌM CÔNG THỨC ---
    if (intent === "find_recipe") {
      const isPremiumUser = await checkUserPremiumStatus(userId);
      const recipes = await Recipe.find(
        { $text: { $search: message }, status: 'approved' },
        { score: { $meta: 'textScore' } }
      ).sort({ score: { $meta: 'textScore' } }).limit(5).populate('author', 'fullName');

      let contextPrompt = "";
      
      if (recipes.length > 0) {
        // --- TÌM THẤY TRONG DB ---
        const topRecipe = recipes[0];
        const isLocked = topRecipe.isPremium && !isPremiumUser;

        finalResponse.recipe_card = {
          id: topRecipe._id,
          name: topRecipe.name,
          image: topRecipe.imageUrl,
          is_locked: isLocked
        };
        finalResponse.suggested_actions = ["Biến tấu món này", "Món ăn kèm phù hợp"];

        if (!isLocked) {
          const recipeDetails = recipes.filter(r => !r.isPremium || isPremiumUser).map(r => 
            `Tên: ${r.name}, NL: ${r.ingredients.map(i=>i.name).join(', ')}, Các bước: ${r.steps.join('; ')}`
          ).join('\n');

          contextPrompt = `
          ${BARTENDER_PERSONA}
          Dữ liệu: ${recipeDetails}
          User hỏi: "${message}"
          1. Giới thiệu món ${topRecipe.name} (Viết tên món IN HOA).
          2. Mô tả sơ lược vị ngon.
          3. Mời user nhấn vào thẻ bên dưới.
          LƯU Ý: Không dùng dấu sao (*).
          `;
        } else {
          contextPrompt = `
          ${BARTENDER_PERSONA}
          User tìm món: "${topRecipe.name}" (Premium).
          Hãy giới thiệu hấp dẫn (Viết tên món IN HOA) và mời nâng cấp Premium.
          `;
        }

      } else {
        // --- KHÔNG TÌM THẤY ---
        finalResponse.recipe_card = null;
        finalResponse.suggested_actions = ["Gợi ý món khác", "Quay lại menu chính"];
        
        contextPrompt = `
        ${BARTENDER_PERSONA}
        User hỏi: "${message}". Không có trong Menu.
        
        YÊU CẦU:
        1. Hướng dẫn công thức.
        2. Format bắt buộc:
           ✨ TÊN MÓN (IN HOA) ✨
           🥃 NGUYÊN LIỆU (IN HOA): ...
           📝 CÁCH LÀM (IN HOA): ...
        3. Không dùng dấu sao (*).
        `;
      }

      const geminiRes = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        { contents: [{ parts: [{ text: contextPrompt }] }] },
        { headers: { 'Content-Type': 'application/json' } }
      );
      
      const rawText = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text || "Mình tìm thấy món này!";
      finalResponse.text_response = cleanResponse(rawText);
      
      return res.json(finalResponse);
    } 

    // --- CASE 2: CHAT & HỘI THOẠI NỐI TIẾP ---
    const chatPrompt = `
    ${BARTENDER_PERSONA}
    LỊCH SỬ CHAT: ${history.slice(-4).map(h => `${h.role}: ${h.text}`).join('\n')}
    USER VỪA NÓI: "${message}"
    
    NHIỆM VỤ:
    1. Trả lời thân thiện. Nếu user nói "Có" hay "Đồng ý", hãy thực hiện gợi ý trước đó.
    2. Tên các loại rượu hoặc tiêu đề quan trọng phải viết IN HOA.
    3. KHÔNG dùng dấu sao (*).
    `;
    
    const geminiRes = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: chatPrompt }] }] },
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    const rawText = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text || "Bạn nói lại được không?";
    finalResponse.text_response = cleanResponse(rawText);
    
    // Logic gợi ý thêm
    const lowerResponse = finalResponse.text_response.toLowerCase();
    if (lowerResponse.includes("rum")) finalResponse.suggested_actions = ["Công thức Daiquiri", "Công thức Mai Tai"];
    else if (lowerResponse.includes("gin")) finalResponse.suggested_actions = ["Công thức Gin Tonic", "Công thức Martini"];
    
    return res.json(finalResponse);

  } catch (error) {
    console.error("Server Error:", error);
    res.status(500).json({ 
      text_response: "Xin lỗi, BarBuddy đang bị quá tải. Bạn thử lại sau nhé! 🍸",
      recipe_card: null,
      suggested_actions: []
    });
  }
}
