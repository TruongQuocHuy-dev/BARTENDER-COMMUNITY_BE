// scripts/indexRecipes.js
import 'dotenv/config'; 
import { Pinecone } from '@pinecone-database/pinecone';
import { pipeline } from '@xenova/transformers'; // Dùng thư viện local
import Recipe from '../models/Recipe.js'; 
import { connectDB } from '../utils/connectDB.js'; 

// 1. Khởi tạo
await connectDB();
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index = pinecone.index('recipe-images'); // Tên index của bạn

console.log("Đang tải mô hình AI... (Việc này có thể mất vài phút lần đầu tiên)");
const extractorPromise = pipeline(
  'image-feature-extraction', // Tên task đúng
  'Xenova/clip-vit-base-patch32' // Dimension 512
);
console.log("Mô hình AI đã sẵn sàng.");

// Hàm lấy vector (đã sửa lỗi Array.from)
async function getEmbedding(imageUrl) {
  try {
    const extractor = await extractorPromise;
    const output = await extractor(imageUrl, {
      pooling: 'mean',
      normalize: true,
    });
    // Chuyển sang Array chuẩn
    return Array.from(output.data);
  } catch (err) {
    console.error(`Lỗi getEmbedding cho ${imageUrl}:`, err.message);
    throw err;
  }
}

// 2. Lấy dữ liệu (SỬA LẠI DÒNG NÀY)
console.log('Đang tải công thức từ MongoDB...');
// Lấy thêm category và difficulty
const allRecipes = await Recipe.find({ imageUrl: { $ne: null } })
  .select('_id imageUrl category difficulty'); // <-- THAY ĐỔI 1

console.log(`Tìm thấy ${allRecipes.length} công thức để index...`);

// 3. Vòng lặp và Index
for (const recipe of allRecipes) {
  try {
    const imageUrl = recipe.imageUrl;
    if (!imageUrl) continue; 

    console.log(`Đang xử lý recipe: ${recipe._id}`);
    
    const vector = await getEmbedding(imageUrl);

    // Sửa lại hàm upsert để thêm metadata
    await index.upsert([
      {
        id: recipe._id.toString(), 
        values: vector,
        // --- THAY ĐỔI 2: THÊM METADATA ---
        metadata: {
          "category": recipe.category || "unknown",
          "difficulty": recipe.difficulty || "unknown"
        }
        // ---------------------------------
      }
    ]);
  } catch (error) {
    console.error(`Lỗi khi index ${recipe._id}:`, error.message);
  }
}
console.log('Hoàn tất index!');