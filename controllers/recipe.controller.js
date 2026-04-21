// controllers/recipeController.js
import mongoose from "mongoose";
import User from "../models/User.js";
import Recipe from "../models/Recipe.js";
import Review from "../models/Review.js";
import Favorite from "../models/Favorite.js";
import Category from "../models/Category.js";
import Notifications from "../models/Notifications.js";
import Subscription from "../models/Subscription.js";
import {
  sendNotificationToPlayers,
  sendNotificationToExternalIds,
} from "../services/notification.service.js";
import Activity from "../models/Activity.js";
import { Pinecone } from "@pinecone-database/pinecone";
import { pipeline } from "@xenova/transformers";
import fs from "fs";

const normalizeRecipeName = (value = "") =>
  String(value)
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const findRecipeByName = async (name) => {
  const normalized = normalizeRecipeName(name);
  if (!normalized) return null;

  return Recipe.findOne(
    {
      $expr: {
        $eq: [{ $toLower: { $trim: { input: "$name" } } }, normalized],
      },
    },
    "_id name"
  ).lean();
};

const extractorPromise = pipeline(
  "image-feature-extraction",
  "Xenova/clip-vit-base-patch32"
);
console.log("Mô hình AI (controller) đã sẵn sàng.");

// --- Hàm getEmbedding (giống file script) ---
async function getEmbedding(imageUrl) {
  try {
    const extractor = await extractorPromise;
    const output = await extractor(imageUrl, {
      pooling: "mean",
      normalize: true,
    });
    return Array.from(output.data);
  } catch (error) {
    console.error("Lỗi trong getEmbedding (controller):", error);
    throw new Error("Không thể tạo vector từ ảnh");
  }
}

// --- HÀM SEARCHBYIMAGE ĐÃ CẬP NHẬT ---
const MIN_SIMILARITY_THRESHOLD = 0.8; // Ngưỡng độ giống

const searchByImage = async (req, res) => {
  try {
    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    if (!process.env.PINECONE_API_KEY) {
      throw new Error("PINECONE_API_KEY không tồn tại");
    }
    const index = pinecone.index("recipe-images");

    if (!req.file) {
      return res.status(400).json({ message: "Vui lòng tải lên một hình ảnh" });
    }

    const imageUrl = req.file.path;
    const { category, difficulty } = req.body;
    console.log("Đang lọc theo metadata:", { category, difficulty });

    console.log("Đang tạo vector cho ảnh user...");
    const queryVector = await getEmbedding(imageUrl);

    // --- BẮT ĐẦU SỬA LỖI ---

    // 1. Xây dựng bộ lọc (filter)
    const queryFilter = {};
    if (category) {
      queryFilter.category = { $eq: category };
    }
    if (difficulty) {
      queryFilter.difficulty = { $eq: difficulty };
    }

    // 2. Tạo đối tượng query cơ bản
    const queryOptions = {
      vector: queryVector,
      topK: 3,
      // KHÔNG có 'filter' ở đây
    };

    // 3. Chỉ thêm 'filter' NẾU nó không rỗng
    if (Object.keys(queryFilter).length > 0) {
      queryOptions.filter = queryFilter;
      console.log("Đang áp dụng bộ lọc:", queryFilter);
    } else {
      console.log("Không áp dụng bộ lọc metadata.");
    }

    // 4. Tìm kiếm Pinecone (Dùng queryOptions đã xây dựng)
    console.log("Đang tìm kiếm CSDL vector...");
    const queryResponse = await index.query(queryOptions);

    // --- KẾT THÚC SỬA LỖI ---

    // 5. Lọc kết quả theo ngưỡng
    const allMatches = queryResponse.matches || [];
    console.log(
      "Các kết quả thô (bao gồm điểm):",
      allMatches.map((m) => ({ id: m.id, score: m.score }))
    );

    const goodMatches = allMatches.filter(
      (match) => match.score > MIN_SIMILARITY_THRESHOLD
    );
    console.log(
      `Đã lọc: giữ lại ${goodMatches.length} kết quả (trên ${allMatches.length})`
    );

    const recipeIds = goodMatches.map((match) => match.id);

    if (recipeIds.length === 0) {
      console.log("Không tìm thấy kết quả nào đủ tốt.");
      return res.json([]);
    }

    // 6. Lấy data từ MongoDB
    console.log("Tìm thấy IDs (đã lọc):", recipeIds);

    const recipes = await Recipe.find({ 
      _id: { $in: recipeIds },
      status: "approved" // Chỉ tìm công thức đã duyệt
    }).populate(
      "author",
      "fullName email avatarUrl"
    );

    const sortedRecipes = recipes.sort((a, b) => {
      return (
        recipeIds.indexOf(a._id.toString()) - recipeIds.indexOf(b.toString())
      );
    });
    res.json(sortedRecipes);
  } catch (error) {
    console.error("Lỗi khi tìm kiếm bằng hình ảnh:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAllRecipes = async (req, res) => {
  try {
    // 1. NHẬN THÊM 'page' TỪ QUERY
    const { category, limit, page } = req.query;
    const parsedLimit = parseInt(limit) || 10;
    const parsedPage = parseInt(page) || 1; // CÔNG THỨC PHÂN TRANG
    const skip = (parsedPage - 1) * parsedLimit;

    const filter = {
      status: "approved" // Luôn luôn chỉ lấy công thức đã duyệt
    };
    if (category) filter.category = category;

    let query = Recipe.find(filter)
      .populate("author", "fullName email avatarUrl")
      .sort({ createdAt: -1 }); // Thêm .sort() để đảm bảo thứ tự ổn định // 2. ÁP DỤNG .skip() VÀ .limit()

    query = query.skip(skip).limit(parsedLimit);
    const recipes = await query.exec();

    const userId = req.user?.id;

    // 3. SỬA LỖI LOGIC 'favoriteMap' CỦA BẠN
    let favoriteMap = {}; // Khai báo 1 lần ở đây

    if (userId && recipes.length > 0) {
      // Thêm check recipes.length
      const recipeIds = recipes.map((r) => r._id.toString());
      const favorites = await Favorite.find({
        userId,
        recipeId: { $in: recipeIds },
      });

      // Gán vào 'favoriteMap' bên ngoài, không 'const' 1 map mới
      favoriteMap = favorites.reduce((acc, fav) => {
        acc[fav.recipeId.toString()] = true;
        return acc;
      }, {});
      // Hai dòng 'const favoriteMap = ...' và 'favoriteMap = ...' của bạn đã bị xóa
    }

    const result = recipes.map((r) => ({
      ...r.toObject(),
      isFavorite: !!favoriteMap[r._id.toString()], // Bây giờ sẽ dùng map đúng
    }));

    res.json(result);
  } catch (error) {
    console.error("Error in getAllRecipes:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getRecipeById = async (req, res) => {
  try {
    const recipeId = req.params.id;
    const userId = req.user?._id;

    console.log("🧩 Fetching recipeId:", recipeId);

    const recipe = await Recipe.findOne({ 
      _id: recipeId, 
      status: "approved" // Chỉ tìm thấy nếu đã được duyệt
    }).populate(
      "author",
      "fullName email avatarUrl"
    );

    console.log("📦 Recipe found:", recipe ? recipe.name : "❌ none");

    if (!recipe) {
      return res.status(404).json({ message: "Không tìm thấy công thức" });
    }

    let isFavorite = false;
    if (userId) {
      const favorite = await Favorite.findOne({ userId, recipeId });
      isFavorite = !!favorite;
    }

    res.json({ ...recipe.toObject(), isFavorite });
  } catch (error) {
    console.error("Error in getRecipeById:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const createRecipe = async (req, res, next) => {
  try {
    // 1. Lấy user từ 'protect' middleware
    const currentUser = req.user;
    if (!currentUser) {
      // Dòng này gần như không bao giờ chạy nếu 'protect' hoạt động đúng
      return res.status(401).json({ message: "Yêu cầu xác thực" });
    }

    // 2. Kiểm tra file và parse dữ liệu
    // (Giữ nguyên logic validation và parse JSON của bạn)
    if (!req.files?.imageFile?.[0]) {
      return res.status(400).json({ message: "Recipe image is required" });
    }
    
    let ingredients = [];
    let steps = [];

    try {
      if (req.body.ingredients) {
        ingredients = JSON.parse(req.body.ingredients);
      }
      if (req.body.steps) {
        // Model của bạn (Recipe.js) định nghĩa 'steps' là [String]
        // nên chúng ta parse nó thành mảng các chuỗi
        steps = JSON.parse(req.body.steps); 
      }
    } catch (parseError) {
      console.error("Parse error:", parseError);
      return res.status(400).json({
        message: "Invalid JSON data",
        details: parseError.message,
      });
    }

    // 3. Tạo đối tượng data công thức
    const recipeName = String(req.body.name || "").trim();
    const duplicatedRecipe = await findRecipeByName(recipeName);
    if (duplicatedRecipe) {
      return res.status(409).json({
        message: `Tên công thức đã tồn tại: ${duplicatedRecipe.name}`,
      });
    }

    const recipeData = {
      name: recipeName,
      description: req.body.description || "",
      category: req.body.category,
      difficulty: req.body.difficulty || "medium",
      alcoholLevel: req.body.alcoholLevel || "medium",
      isPremium: req.body.isPremium === "true",
      imageUrl: req.files.imageFile[0].path,
      videoUrl: req.files.videoFile?.[0]?.path || null,
      ingredients: ingredients, // Đã parse
      steps: steps, // Đã parse
      author: req.body.author, // Hoặc bạn có thể dùng currentUser._id
      
      // 👇 LOGIC QUAN TRỌNG: Quyết định 'status' dựa trên vai trò (role)
      // (Giả định bạn có trường 'role' trong User model, ví dụ: 'admin' hoặc 'user')
      status: (currentUser.role === 'admin') ? 'approved' : 'pending'
    };

    // Validate parsed data
    if (
      !Array.isArray(recipeData.ingredients) ||
      recipeData.ingredients.length === 0
    ) {
      return res
        .status(400)
        .json({ message: "At least one ingredient is required" });
    }

    if (!Array.isArray(recipeData.steps) || recipeData.steps.length === 0) {
      return res.status(400).json({ message: "At least one step is required" });
    }

    // Validate required fields
    const requiredFields = ["name", "category", "author"];
    for (const field of requiredFields) {
      if (!recipeData[field]) {
        return res.status(400).json({
          message: `${field} is required`,
        });
      }
    }

    // Validate arrays
    if (
      !Array.isArray(recipeData.ingredients) ||
      recipeData.ingredients.length === 0
    ) {
      return res.status(400).json({
        message: "At least one ingredient is required",
      });
    }

    if (!Array.isArray(recipeData.steps) || recipeData.steps.length === 0) {
      return res.status(400).json({
        message: "At least one step is required",
      });
    }

    console.log(`Creating recipe. User: ${currentUser.fullName}, Role: ${currentUser.role}, Status set to: ${recipeData.status}`);

    try {
      // Create recipe
      const recipe = await Recipe.create(recipeData);

      // Update category count
      await Category.findOneAndUpdate(
        { name: recipeData.category },
        { $inc: { count: 1 } },
        { upsert: true }
      );

      // === BẮT ĐẦU: GỬI THÔNG BÁO ===
      if (recipe.isPremium && recipe.status === 'approved') {
        try {
          console.log(
            `[Notification] Admin ${currentUser.fullName} đã tạo công thức Premium ${recipe.name}. Bắt đầu gửi thông báo...`
          );
          
          // 1. Tìm TẤT CẢ user có gói premium CÒN HẠN
          const activeSubscriptions = await Subscription.find({
            tier: "premium",
            endDate: { $gt: new Date() },
          }).select("user");

          const premiumUserIds = activeSubscriptions.map((sub) => sub.user);

          if (premiumUserIds.length > 0) {
            
            // --- LOGIC 1: GỬI PUSH NOTIFICATION ---
            // (Giả định bạn có model 'Notifications' để check quyền)
            const willingUsers = await Notifications.find({
              user: { $in: premiumUserIds },
              pushEnabled: true, 
              // newRecipes: true, // (Bạn có thể thêm check này nếu có)
            }).select("user");

            const finalUserIds = willingUsers.map((notif) => notif.user);

            if (finalUserIds.length > 0) {
              console.log(
                `[Notification] Gửi PUSH đến ${finalUserIds.length} External User ID.`
              );
              sendNotificationToExternalIds(
                finalUserIds.map((id) => id.toString()),
                { en: "New Premium Recipe!", vi: "Công thức Độc quyền Mới!" },
                {
                  en: `Check out the new recipe: ${recipeData.name}`,
                  vi: `Khám phá công thức mới: ${recipeData.name}`,
                },
                { type: "new_recipe", id: recipe._id.toString() }
              );
            }

            // --- LOGIC 2: LƯU VÀO FEED (Activity) ---
            const author = await User.findById(recipe.author); // Lấy tên tác giả
            const authorName = author ? author.fullName : "Admin";
            const message = `${authorName} đã đăng công thức đặc quyền mới: ${recipe.name}`;

            const activityDocs = premiumUserIds.map((userId) => ({
              user: userId, // Người nhận (User Premium)
              actor: recipe.author, // Người thực hiện (Admin/Tác giả)
              type: "new_recipe",
              entity: recipe._id,
              message: message,
            }));

            await Activity.insertMany(activityDocs);
            console.log(
              `[Notification] Đã lưu ${activityDocs.length} bản ghi Activity (feed).`
            );
          }
        } catch (notifError) {
          console.error(
            `[Notification] Lỗi khi xử lý thông báo (Admin create):`,
            notifError
          );
          // Không ném lỗi, chỉ log, để request chính vẫn thành công
        }
      } else {
         // Log này sẽ chạy cho User (hoặc Admin tạo bài non-premium)
         console.log(`[Notification] Recipe ${recipe.name} đã được tạo (Status: ${recipe.status}). Chờ admin duyệt (nếu là user).`);
      }
      // === KẾT THÚC: GỬI THÔNG BÁO ===

      console.log("Recipe created successfully:", recipe);
      return res.status(201).json(recipe); // Trả về công thức đã tạo

    } catch (dbError) {
      // Xử lý lỗi nếu không lưu được vào DB
      console.error("Database error:", dbError);
      return res.status(500).json({
        message: "Error saving recipe",
        error: dbError.message || "Unknown database error",
      });
    }
  } catch (error) {
    // Xử lý các lỗi chung (ví dụ: lỗi middleware, lỗi không xác định)
    next(error);
  }
};

const updateRecipe = async (req, res) => {
  try {
    const recipeId = req.params.id;
    const { author, ...updateData } = req.body;
    const imageUrl = req.files?.imageFile
      ? req.files.imageFile[0].path
      : undefined;
    const videoUrl = req.files?.videoFile
      ? req.files.videoFile[0].path
      : undefined;

    const updateFields = { ...updateData };

    // --- BẮT ĐẦU SỬA LỖI ---
    // Thêm logic parse JSON cho các trường mảng
    try {
      if (updateFields.ingredients) {
        updateFields.ingredients = JSON.parse(updateFields.ingredients);
      }
      if (updateFields.steps) {
        updateFields.steps = JSON.parse(updateFields.steps);
      }
    } catch (parseError) {
      console.error("Parse error during update:", parseError);
      return res.status(400).json({
        message: "Invalid JSON data for ingredients or steps",
        details: parseError.message,
      });
    }
    // --- KẾT THÚC SỬA LỖI ---

    if (imageUrl !== undefined) updateFields.imageUrl = imageUrl;
    if (videoUrl !== undefined) updateFields.videoUrl = videoUrl; // Logic xử lý category count (từ lần trước)

    if (updateFields.category) {
      const oldRecipe = await Recipe.findById(recipeId).select("category");
      if (oldRecipe && oldRecipe.category !== updateFields.category) {
        await Category.findOneAndUpdate(
          { name: oldRecipe.category },
          { $inc: { count: -1 } }
        );
        await Category.findOneAndUpdate(
          { name: updateFields.category },
          { $inc: { count: 1 } }
        );
      }
    }

    const recipe = await Recipe.updateRecipe(recipeId, updateFields);
    res.json(recipe);
  } catch (error) {
    // Thêm log chi tiết hơn để dễ gỡ lỗi
    console.error("Error in updateRecipe:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const deleteRecipe = async (req, res) => {
  try {
    const recipeId = req.params.id;
    const recipe = await Recipe.deleteRecipe(recipeId);
    await Category.findOneAndUpdate(
      { name: recipe.category },
      { $inc: { count: -1 } },
      { upsert: true }
    );
    await Review.deleteMany({ recipeId: recipe._id });
    await Favorite.deleteMany({ recipeId: recipe.id });
    res.json({ message: "Recipe deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const toggleFavorite = async (req, res) => {
  try {
    const recipeId = req.params.id;
    const userId = req.user?._id || req.user?.id;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!recipeId)
      return res.status(400).json({ message: "Missing recipe id" });

    const uid = new mongoose.Types.ObjectId(userId);
    const rid = new mongoose.Types.ObjectId(recipeId);

    const existing = await Favorite.findOne({ userId: uid, recipeId: rid });

    let isFavorite;
    if (existing) {
      await Favorite.deleteOne({ _id: existing._id });
      isFavorite = false;
    } else {
      await Favorite.create({ userId: uid, recipeId: rid });
      isFavorite = true;
    }

    const favoriteCount = await Favorite.countDocuments({ recipeId: rid });

    return res.status(200).json({
      message: "Favorite status updated",
      isFavorite,
      favoriteCount,
      recipeId,
    });
  } catch (error) {
    console.error("Error in toggleFavorite:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

const getUserFavorites = async (req, res) => {
  try {
    const userId = req.user._id;
    const favorites = await Favorite.find({ userId });
    res.json(favorites.map((fav) => fav.recipeId));
  } catch (error) {
    console.error("Error getting favorites:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * LẤY CÔNG THỨC THEO USER (Hỗ trợ phân trang)
 * GET /api/users/:userId/recipes
 */
const getRecipesByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid User ID" });
    }
    const userExists = await User.findById(userId);
    if (!userExists) {
      return res.status(404).json({ message: "User not found" });
    }

    // Phân trang
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10; // Lấy 10 recipe mỗi lần
    const skip = (page - 1) * limit;

    // Lọc recipe theo 'author' (hoặc trường bạn dùng để lưu người tạo)
    const recipes = await Recipe.find({ 
      author: userId,
      status: "approved" // <-- THÊM VÀO
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // 👇 CHANGED: Thêm 'status: "approved"'
    const totalRecipes = await Recipe.countDocuments({ 
      author: userId,
      status: "approved" // <-- THÊM VÀO
    });

    res.status(200).json({
      data: recipes,
      currentPage: page,
      totalPages: Math.ceil(totalRecipes / limit),
      totalRecipes,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Get recipes by user failed", error: err.message });
  }
};

/**
 * GET MY FAVORITE RECIPES (Paginated)
 * GET /api/users/me/favorites/recipes
 */
const getMyFavoriteRecipes = async (req, res) => {
  try {
    const userId = req.user.id; // Get ID from logged-in user token
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10; // Adjust limit as needed
    const skip = (page - 1) * limit;

    // 1. Find favorite records for the user
    const favoriteRecords = await Favorite.find({ userId: userId });
    const favoriteRecipeIds = favoriteRecords.map((fav) => fav.recipeId);

    // 2. Find the actual recipes matching those IDs, with pagination
    const recipes = await Recipe.find({ 
      _id: { $in: favoriteRecipeIds },
      status: "approved" // <-- THÊM VÀO
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // 👇 CHANGED: Thêm 'status: "approved"'
    const totalRecipes = await Recipe.countDocuments({
      _id: { $in: favoriteRecipeIds },
      status: "approved" // <-- THÊM VÀO
    });

    res.status(200).json({
      data: recipes,
      currentPage: page,
      totalPages: Math.ceil(totalRecipes / limit),
      totalRecipes,
    });
  } catch (err) {
    console.error("Get my favorite recipes error:", err);
    res
      .status(500)
      .json({ message: "Failed to get favorite recipes", error: err.message });
  }
};

/**
 * TÌM KIẾM CÔNG THỨC (NÂNG CAO + TEXT)
 * GET /api/recipes/search
 */
const searchRecipes = async (req, res) => {
  try {
    const { category, difficulty, ingredients, keyword } = req.query;

    // 1. Xây dựng bộ lọc (query) cho MongoDB
    const queryFilter = { status: "approved" }; // Luôn luôn chỉ tìm công thức đã duyệt

    if (category) {
      // --- SỬA LỖI VIẾT THƯỜNG ---
      // Dùng regex với cờ 'i' (insensitive) để không phân biệt hoa/thường
      // Dấu ^ và $ để đảm bảo nó khớp toàn bộ chuỗi (vd: "mocktail" khớp "Mocktail"
      // nhưng "cocktail" không khớp "Modern Cocktails")
      queryFilter.category = { $regex: new RegExp(`^${category}$`, "i") };
    }
    if (difficulty) {
      // --- SỬA LỖI VIẾT THƯỜNG ---
      // Tương tự, không phân biệt hoa/thường cho độ khó
      queryFilter.difficulty = { $regex: new RegExp(`^${difficulty}$`, "i") };
    }
    if (keyword) {
      // Tìm kiếm văn bản (không phân biệt hoa/thường) trong trường 'name'
      queryFilter.name = { $regex: keyword, $options: "i" };
    }
    if (ingredients) {
      // Tìm các công thức chứa TẤT CẢ các nguyên liệu
      const ingredientList = ingredients
        .split(",")
        .map((ing) => ing.trim())
        .filter((ing) => ing.length > 0);

      if (ingredientList.length > 0) {
        // Logic này đã đúng (dùng 'i' - insensitive)
        const ingredientRegexList = ingredientList.map(
          (ing) => new RegExp(ing, "i")
        );
        queryFilter["ingredients.name"] = { $all: ingredientRegexList };
      }
    }

    // 2. Thực thi query để lấy công thức
    const recipes = await Recipe.find(queryFilter).populate(
      "author",
      "fullName email avatarUrl"
    );

    // 3. Xử lý logic 'isFavorite' (Phần này không đổi)
    const userId = req.user?.id;
    let favoriteMap = {};

    if (userId) {
      const recipeIds = recipes.map((r) => r._id.toString());
      const favorites = await Favorite.find({
        userId,
        recipeId: { $in: recipeIds },
      });
      favoriteMap = favorites.reduce((acc, fav) => {
        acc[fav.recipeId.toString()] = true;
        return acc;
      }, {});
    }

    const result = recipes.map((r) => ({
      ...r.toObject(),
      isFavorite: !!favoriteMap[r._id.toString()],
    }));

    res.json(result);
  } catch (error) {
    console.error("Error in searchRecipes:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export {
  getAllRecipes,
  getRecipeById,
  createRecipe,
  updateRecipe,
  deleteRecipe,
  toggleFavorite,
  getUserFavorites,
  getRecipesByUser,
  getMyFavoriteRecipes,
  searchRecipes,
  searchByImage,
};
