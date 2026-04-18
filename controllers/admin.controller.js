import User from "../models/User.js";
import Post from "../models/Post.js";
import Recipe from "../models/Recipe.js";
import Category from "../models/Category.js";
import Banner from "../models/Banner.js";
import Comment from "../models/Comment.js";
import Payment from "../models/Payment.js";
import Report from "../models/Report.js";
import SubscriptionPlan from "../models/SubscriptionPlan.js";

import Notifications from "../models/Notifications.js";
import Subscription from "../models/Subscription.js";
import Activity from "../models/Activity.js";
import { sendNotificationToExternalIds } from "../services/notification.service.js";

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password").lean();
    const userIds = users.map((u) => u._id);

    const subscriptions = await Subscription.find({
      user: { $in: userIds },
    })
      .select("user tier planId endDate")
      .lean();

    const subscriptionMap = new Map(
      subscriptions.map((sub) => [String(sub.user), sub]),
    );

    const usersWithSubscription = users.map((user) => ({
      ...user,
      isActive: user.isActive ?? true,
      isBanned: user.isBanned ?? false,
      subscription: subscriptionMap.get(String(user._id)) || {
        tier: "free",
        planId: "free",
        endDate: null,
      },
    }));

    res.json(usersWithSubscription);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch users" });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.role === "admin") {
      return res
        .status(400)
        .json({ message: "Cannot delete admin or user not found" });
    }
    await user.deleteOne();
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete user" });
  }
};

export const updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const { role, isBanned, isVerified, subscriptionPlanId } = req.body;

    let resolvedPlan = null;
    if (typeof subscriptionPlanId === "string" && subscriptionPlanId.trim()) {
      const planId = subscriptionPlanId.trim();
      if (planId !== "free") {
        resolvedPlan = await SubscriptionPlan.findOne({ planId });
        if (!resolvedPlan) {
          return res.status(400).json({ message: "Invalid subscription plan" });
        }
      }
    }

    const updateData = {
      ...(["user", "admin"].includes(role) ? { role } : {}),
      ...(typeof isBanned === "boolean" ? { isBanned } : {}),
      ...(typeof isVerified === "boolean" ? { isVerified } : {}),
    };

    // Prevent changing password via this endpoint
    delete updateData.password;

    const hasSubscriptionChange = typeof subscriptionPlanId === "string" && subscriptionPlanId.trim().length > 0;

    if (Object.keys(updateData).length === 0 && !hasSubscriptionChange) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    const user = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    }).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    if (hasSubscriptionChange) {
      const planId = subscriptionPlanId.trim();
      if (planId === "free") {
        await Subscription.findOneAndUpdate(
          { user: userId },
          {
            $set: {
              user: userId,
              planId: "free",
              tier: "free",
              price: 0,
              currency: "USD",
              endDate: null,
              autoRenew: false,
            },
          },
          { upsert: true, new: true, runValidators: true },
        );
      } else if (resolvedPlan) {
        const currentSubscription = await Subscription.findOne({ user: userId });
        await Subscription.findOneAndUpdate(
          { user: userId },
          {
            $set: {
              user: userId,
              planId: resolvedPlan.planId,
              tier: resolvedPlan.tier,
              price: resolvedPlan.price,
              currency: resolvedPlan.currency,
              ...(currentSubscription?.startDate ? {} : { startDate: new Date() }),
              autoRenew: currentSubscription?.autoRenew ?? true,
              endDate: currentSubscription?.endDate ?? null,
            },
          },
          { upsert: true, new: true, runValidators: true },
        );
      }
    }

    res.json(user);
  } catch (err) {
    console.error("updateUser error:", err);
    if (err.code === 11000 && err.keyPattern?.email) {
      return res.status(400).json({ message: "Email already in use" });
    }
    res.status(500).json({ message: "Failed to update user" });
  }
};

export const getAllPosts = async (_, res) => {
  try {
    const posts = await Post.find().populate("author", "fullName");
    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch posts" });
  }
};

export const deletePost = async (req, res) => {
  try {
    await Post.findByIdAndDelete(req.params.id);
    res.json({ message: "Post deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete post" });
  }
};

export const deleteComment = async (req, res) => {
  try {
    await Comment.findByIdAndDelete(req.params.id);
    res.json({ message: "Comment deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete comment" });
  }
};

export const getAdminStats = async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    const recipeCount = await Recipe.countDocuments();
    const postCount = await Post.countDocuments();
    const bannerCount = await Banner.countDocuments();
    const commentCount = await Comment.countDocuments();
    const reportsPending = await Report.countDocuments({ status: "pending" });
    const reportsResolved = await Report.countDocuments({ status: "resolved" });
    const totalRevenueAgg = await Payment.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalRevenue = totalRevenueAgg[0]?.total || 0;

    const recentUsers = await User.find()
      .sort("-createdAt")
      .limit(5)
      .select("-password");
    const recentRecipes = await Recipe.find()
      .sort("-createdAt")
      .limit(5)
      .populate("author", "fullName");
    const recentPosts = await Post.find()
      .sort("-createdAt")
      .limit(5)
      .populate("author", "fullName");

    res.json({
      counts: {
        userCount,
        recipeCount,
        postCount,
        bannerCount,
        commentCount,
        reportsPending,
        reportsResolved,
        totalRevenue,
      },
      recent: { recentUsers, recentRecipes, recentPosts },
    });
  } catch (err) {
    console.error("getAdminStats error:", err);
    res.status(500).json({ message: "Failed to fetch admin stats" });
  }
};

export const getRevenueStats = async (req, res) => {
  try {
    const matchCompleted = { status: "completed" };

    const totalRevenueAgg = await Payment.aggregate([
      { $match: matchCompleted },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const monthlyAgg = await Payment.aggregate([
      { $match: matchCompleted },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    const totalRevenue = totalRevenueAgg[0]?.total || 0;
    const monthlyRevenue = monthlyAgg.map((m) => ({
      year: m._id.year,
      month: m._id.month,
      total: m.total,
      count: m.count,
    }));

    res.json({ totalRevenue, monthlyRevenue });
  } catch (err) {
    console.error("getRevenueStats error:", err);
    res.status(500).json({ message: "Failed to fetch revenue stats" });
  }
};

/**
 * [ADMIN] Lấy tất cả báo cáo
 */
export const getAllReports = async (req, res) => {
  try {
    // Lấy và sắp xếp pending lên đầu
    const reports = await Report.find()
      .populate("reporter", "fullName email")
      .populate("reportedPost", "caption likes comments") // <-- Thêm 'likes' và 'comments'
      .populate("reportedComment")
      .sort({ status: 1, createdAt: -1 }); // Ưu tiên 'pending'
    res.json(reports);
  } catch (err) {
    console.error("getAllReports error:", err);
    res.status(500).json({ message: "Failed to fetch reports" });
  }
};

/**
 * [ADMIN] Cập nhật trạng thái báo cáo (Resolve)
 */
export const updateReportStatus = async (req, res) => {
  try {
    const { status } = req.body; // Thường là 'resolved'
    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!report) return res.status(404).json({ message: "Report not found" });
    res.json(report);
  } catch (err) {
    console.error("updateReportStatus error:", err);
    res.status(500).json({ message: "Failed to update report" });
  }
};

/**
 * [ADMIN] Xóa một báo cáo
 */
export const deleteReport = async (req, res) => {
  try {
    const report = await Report.findByIdAndDelete(req.params.id);
    if (!report) return res.status(404).json({ message: "Report not found" });

    res.json({ message: "Report deleted" });
  } catch (err) {
    console.error("deleteReport error:", err);
    res.status(500).json({ message: "Failed to delete report" });
  }
};


/**
 * [ADMIN] Lấy các công thức chờ duyệt
 * (CẬP NHẬT: Lấy cả 'pending' VÀ 'status' không tồn tại)
 */
export const getPendingRecipes = async (req, res) => {
  try {
    const pendingRecipes = await Recipe.find({
      $or: [
        { status: "pending" },
        { status: { $exists: false } }
      ]
    })
      .populate("author", "fullName email")
      .sort({ createdAt: 1 }); // Cũ nhất trước
      
    res.json(pendingRecipes);
  } catch (err) {
    console.error("getPendingRecipes error:", err);
    res.status(500).json({ message: "Failed to fetch pending recipes" });
  }
};

/**
 * [ADMIN] Duyệt một công thức
 */
export const approveRecipe = async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found" });
    }
    // Check này vẫn đúng
    if (recipe.status === "approved") {
      return res.status(400).json({ message: "Recipe already approved" });
    }

    // 👇 CHANGED: Dùng updateOne để tránh lỗi validation 'author'
    await Recipe.updateOne(
      { _id: recipe._id },
      { $set: { status: "approved" } }
    );
    
    // Gán lại status vào object để hàm thông báo nhận diện đúng
    recipe.status = "approved"; 

    // 👇 CHANGED: GỌI HÀM HELPER CHÍNH XÁC
    // (Xóa toàn bộ khối 'if (recipe.isPremium)' cũ)
    await sendRecipeApprovalNotifications(recipe); 

    res.json(recipe);
    
  } catch (err) {
    console.error("approveRecipe error:", err);
    res.status(500).json({ message: "Failed to approve recipe" });
  }
};

/**
 * [ADMIN] Từ chối một công thức
 */
export const rejectRecipe = async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found" });
    }

    // (Tùy chọn: Bạn có thể lấy lý do từ chối từ req.body)
    // const { reason } = req.body;

    // 👇 CHANGED: Dùng updateOne để tránh lỗi validation
    await Recipe.updateOne(
      { _id: recipe._id },
      { 
        $set: { 
          status: "rejected"
          // rejectReason: reason || "Không phù hợp" // (Nếu bạn có thêm trường này)
        } 
      }
    );
    
    // Gán lại status vào object để hàm thông báo nhận diện đúng
    recipe.status = "rejected"; 

    // 👇 CHANGED: GỌI HÀM HELPER THÔNG BÁO TỪ CHỐI
    await sendRecipeRejectionNotifications(recipe); 

    res.json(recipe);
  } catch (err) {
    console.error("rejectRecipe error:", err);
    res.status(500).json({ message: "Failed to reject recipe" });
  }
};

/**
 * [ADMIN] Lấy TẤT CẢ công thức (cho trang quản lý)
 */
export const getAllRecipesForAdmin = async (req, res) => {
  try {
    const { category } = req.query; // Nhận category nếu có
    
    const filter = {}; // Bắt đầu với filter rỗng
    if (category) {
      filter.category = category;
    }

    // KHÔNG lọc theo status, lấy tất cả
    const recipes = await Recipe.find(filter)
      .populate("author", "fullName email")
      .sort({ createdAt: -1 });
      
    res.json(recipes);
  } catch (err) {
    console.error("getAllRecipesForAdmin error:", err);
    res.status(500).json({ message: "Failed to fetch recipes for admin" });
  }
};

// --- HÀM MỚI: approveAllPendingRecipes ---
/**
 * [ADMIN] Duyệt HÀNG LOẠT tất cả công thức đang chờ
 */
export const approveAllPendingRecipes = async (req, res) => {
  try {
    // 1. Tìm tất cả các bài chờ duyệt
    const pendingRecipes = await Recipe.find({
      $or: [
        { status: "pending" },
        { status: { $exists: false } }
      ]
    });
    
    if (pendingRecipes.length === 0) {
      return res.json({ message: "Không có công thức nào chờ duyệt.", count: 0 });
    }

    let approvedCount = 0;
    
    // 2. Duyệt qua từng bài
    for (const recipe of pendingRecipes) {
      
      // 👇 CHANGED: THAY THẾ 'recipe.save()'
      // Sử dụng 'updateOne' để cập nhật trực tiếp trong DB.
      // Bằng cách này, nó sẽ bỏ qua validation (kiểm tra) 'author'
      // và chỉ tập trung vào việc cập nhật status.
      await Recipe.updateOne(
        { _id: recipe._id },
        { $set: { status: "approved" } }
      );
      // 👆 END CHANGED
      
      // 3. Gán 'status' thủ công vào đối tượng recipe (đang ở trong bộ nhớ)
      // để hàm thông báo bên dưới nhận diện đúng
      recipe.status = "approved"; 

      // 4. Gửi thông báo (Hàm này đã an toàn, 
      // vì nó có check 'if (!author)' bên trong)
      await sendRecipeApprovalNotifications(recipe); 
      approvedCount++;
    }
    
    res.json({ message: `Đã duyệt thành công ${approvedCount} công thức.`, count: approvedCount });

  } catch (err) {
    // Log lỗi nếu có
    console.error("approveAllPendingRecipes error:", err);
    res.status(500).json({ message: "Lỗi khi duyệt hàng loạt" });
  }
};

const DIFFICULTY_VALUES = new Set(["easy", "medium", "hard"]);
const ALCOHOL_VALUES = new Set(["none", "low", "medium", "high"]);

const normalizeImportKey = (key) =>
  String(key || "")
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const getValueByAliases = (row, aliases = []) => {
  if (!row || typeof row !== "object") return "";

  const normalizedRow = {};
  Object.entries(row).forEach(([k, v]) => {
    normalizedRow[normalizeImportKey(k)] = v;
  });

  for (const alias of aliases) {
    const value = normalizedRow[normalizeImportKey(alias)];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return "";
};

const getArrayByAliases = (obj, aliases = []) => {
  if (!obj || typeof obj !== "object") return [];

  const entries = Object.entries(obj);
  for (const alias of aliases) {
    const target = normalizeImportKey(alias);
    const matched = entries.find(([k]) => normalizeImportKey(k) === target);
    if (matched && Array.isArray(matched[1])) return matched[1];
  }

  return [];
};

const toBool = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value !== "string") return false;
  const v = value.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "y";
};

const parseSteps = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((step) => String(step || "").trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const input = value.trim();
    if (!input) return [];

    if (input.startsWith("[")) {
      try {
        const parsed = JSON.parse(input);
        if (Array.isArray(parsed)) {
          return parsed
            .map((step) => String(step || "").trim())
            .filter(Boolean);
        }
      } catch {
        // fallthrough to delimiter parsing
      }
    }

    return input
      .split(";")
      .map((step) => step.trim())
      .filter(Boolean);
  }

  return [];
};

const parseIngredients = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((ing) => ({
        name: String(ing?.name || "").trim(),
        amount: String(ing?.amount || "").trim(),
        unit: String(ing?.unit || "").trim(),
      }))
      .filter((ing) => ing.name);
  }

  if (typeof value === "string") {
    const input = value.trim();
    if (!input) return [];

    if (input.startsWith("[")) {
      try {
        const parsed = JSON.parse(input);
        if (Array.isArray(parsed)) {
          return parsed
            .map((ing) => ({
              name: String(ing?.name || "").trim(),
              amount: String(ing?.amount || "").trim(),
              unit: String(ing?.unit || "").trim(),
            }))
            .filter((ing) => ing.name);
        }
      } catch {
        // fallthrough to delimiter parsing
      }
    }

    const parseIngredientPart = (part) => {
      const chunk = String(part || "").trim();
      if (!chunk) return { name: "", amount: "", unit: "" };

      const pickDelimiter = () => {
        if ((chunk.match(/\|/g) || []).length >= 2) return "|";
        if ((chunk.match(/:/g) || []).length >= 2) return ":";
        if ((chunk.match(/-/g) || []).length >= 2) return "-";
        return "|";
      };

      const delimiter = pickDelimiter();
      const [name = "", amount = "", unit = ""] = chunk.split(delimiter);

      const normalize = (input) => String(input || "").trim();
      const amountOnlyMatch = chunk.match(/^((?:\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?|\d+\/\d+|few|a few|some|ít|vài|nhiều|đủ(?: đầy)?|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười))\s+(.+)$/iu);
      const amountUnitMatch = chunk.match(/^((?:\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?|\d+\/\d+|few|a few|some|ít|vài|nhiều|đủ(?: đầy)?|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười))\s*(ml|l|cl|oz|gr|g|kg|mg|mcg|giọt|dash(?:es)?|muỗng nhỏ|muỗng canh|thìa cà phê|thìa canh|cốc|ly|chai|trái|quả|lá|miếng|lát|nhánh|củ|viên|phần|túi|piece|pieces|drop|drops|pinch)\.?\s+(.+)$/iu);

      if (amountUnitMatch) {
        return {
          name: normalize(amountUnitMatch[3]),
          amount: normalize(amountUnitMatch[1]),
          unit: normalize(amountUnitMatch[2]),
        };
      }

      if (amountOnlyMatch) {
        return {
          name: normalize(amountOnlyMatch[2]),
          amount: normalize(amountOnlyMatch[1]),
          unit: "",
        };
      }

      return {
        name: normalize(name),
        amount: normalize(amount),
        unit: normalize(unit),
      };
    };

    return input
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map(parseIngredientPart)
      .filter((ing) => ing.name);
  }

  return [];
};

const buildRecipesFromSplitSheets = (payload) => {
  const recipeRows = getArrayByAliases(payload, [
    "recipes",
    "recipe_sheet",
    "sheet_recipes",
    "cong_thuc",
    "recipes_data",
  ]);

  if (!recipeRows.length) return [];

  const ingredientRows = getArrayByAliases(payload, [
    "ingredients",
    "ingredient_sheet",
    "sheet_ingredients",
    "nguyen_lieu",
  ]);

  const stepRows = getArrayByAliases(payload, [
    "steps",
    "step_sheet",
    "sheet_steps",
    "cac_buoc",
  ]);

  const recipeMap = new Map();

  const resolveRecipeKey = (row = {}) => {
    const keyValue = getValueByAliases(row, [
      "recipe_key",
      "recipeKey",
      "recipe_id",
      "ma_cong_thuc",
      "recipe_name",
      "ten_cong_thuc",
      "name",
      "ten",
    ]);

    return String(keyValue || "").trim().toLowerCase();
  };

  recipeRows.forEach((row, idx) => {
    const name = String(getValueByAliases(row, ["name", "ten_cong_thuc", "ten", "recipe_name"]) || "").trim();
    const key = resolveRecipeKey(row) || name.toLowerCase() || `row_${idx}`;

    recipeMap.set(key, {
      ...row,
      name,
      ingredients: parseIngredients(getValueByAliases(row, ["ingredients", "nguyen_lieu", "ingredient"])),
      steps: parseSteps(getValueByAliases(row, ["steps", "cac_buoc", "huong_dan"])),
    });
  });

  ingredientRows.forEach((row) => {
    const key = resolveRecipeKey(row);
    if (!key || !recipeMap.has(key)) return;

    const name = String(getValueByAliases(row, ["ingredient", "name", "ingredient_name", "ten_nguyen_lieu", "nguyen_lieu"]) || "").trim();
    const amount = String(getValueByAliases(row, ["quantity", "amount", "so_luong", "soluong", "s_l", "sl", "dinh_luong"]) || "").trim();
    const unit = String(getValueByAliases(row, ["unit", "don_vi", "donvi", "dvt"]) || "").trim();
    const direction = String(getValueByAliases(row, ["ingredient_direction", "ingredientDirection", "huong_dan_nguyen_lieu"]) || "").trim();
    const combined = getValueByAliases(row, ["ingredients", "ingredient", "nguyen_lieu"]) || direction;

    if (name || amount || unit) {
      const fallback = parseIngredients(combined)[0] || {};
      recipeMap.get(key).ingredients.push({
        name: name || fallback.name || "",
        amount: amount || fallback.amount || "",
        unit: unit || fallback.unit || "",
      });
      return;
    }

    const parsedCombined = parseIngredients(combined);
    if (parsedCombined.length) {
      recipeMap.get(key).ingredients.push(...parsedCombined);
    }
  });

  stepRows.forEach((row) => {
    const key = resolveRecipeKey(row);
    if (!key || !recipeMap.has(key)) return;

    const combined = getValueByAliases(row, ["steps", "step", "content", "mo_ta_buoc", "buoc", "cac_buoc"]);
    const parsedSteps = parseSteps(combined);

    if (parsedSteps.length) {
      recipeMap.get(key).steps.push(...parsedSteps);
      return;
    }

    const single = String(combined || "").trim();
    if (single) recipeMap.get(key).steps.push(single);
  });

  return Array.from(recipeMap.values());
};

/**
 * [ADMIN] Import công thức hàng loạt
 * POST /api/admin/recipes/import
 * body: { recipes: RecipeLike[] }
 */
export const importRecipesBulk = async (req, res) => {
  try {
    let inputRecipes = Array.isArray(req.body?.recipes) ? req.body.recipes : [];
    if (!inputRecipes.length && req.body && typeof req.body === "object") {
      inputRecipes = buildRecipesFromSplitSheets(req.body);
    }

    if (!inputRecipes.length) {
      return res.status(400).json({
        message: "recipes must be a non-empty array (or provide split sheets: recipes + ingredients + steps)",
      });
    }

    if (inputRecipes.length > 300) {
      return res.status(400).json({ message: "Maximum 300 recipes per import" });
    }

    const errors = [];
    const normalized = [];

    inputRecipes.forEach((row, index) => {
      const name = String(getValueByAliases(row, ["name", "ten_cong_thuc", "ten", "recipe_name"]) || "").trim();
      const category = String(getValueByAliases(row, ["category", "danh_muc", "loai"]) || "").trim();
      const description = String(getValueByAliases(row, ["description", "mo_ta", "mo_ta_ngan", "desc"]) || "").trim();
      const difficultyRaw = String(getValueByAliases(row, ["difficulty", "do_kho", "level"]) || "medium").trim().toLowerCase();
      const alcoholRaw = String(getValueByAliases(row, ["alcoholLevel", "alcohol_level", "nong_do", "nong_do_con"]) || "medium").trim().toLowerCase();
        const ingredients = parseIngredients(getValueByAliases(row, ["ingredients", "nguyen_lieu", "nguyen_lie", "ingredient", "ingredient_direction"]));
      const steps = parseSteps(getValueByAliases(row, ["steps", "cac_buoc", "buoc_lam", "huong_dan"]));
      const author = getValueByAliases(row, ["author", "authorId", "tac_gia", "nguoi_tao"]) || req.user?._id;

      if (!name) errors.push({ row: index + 1, message: "name is required" });
      if (!category) errors.push({ row: index + 1, message: "category is required" });
      if (!ingredients.length) errors.push({ row: index + 1, message: "at least one ingredient is required" });
      if (!steps.length) errors.push({ row: index + 1, message: "at least one step is required" });

      if (!name || !category || !ingredients.length || !steps.length) return;

      normalized.push({
        name,
        category,
        description,
        difficulty: DIFFICULTY_VALUES.has(difficultyRaw) ? difficultyRaw : "medium",
        alcoholLevel: ALCOHOL_VALUES.has(alcoholRaw) ? alcoholRaw : "medium",
        ingredients,
        steps,
        imageUrl: String(getValueByAliases(row, ["imageUrl", "image_url", "hinh_anh", "anh"]) || "").trim(),
        videoUrl: String(getValueByAliases(row, ["videoUrl", "video_url", "video"]) || "").trim(),
        isPremium: toBool(getValueByAliases(row, ["isPremium", "premium", "cao_cap"])),
        author,
        status: "approved",
      });
    });

    if (!normalized.length) {
      return res.status(400).json({
        message: "No valid recipes to import",
        failedCount: errors.length,
        errors: errors.slice(0, 50),
      });
    }

    const inserted = await Recipe.insertMany(normalized, { ordered: false });

    if (inserted.length) {
      const categoryCounts = inserted.reduce((acc, recipe) => {
        const key = String(recipe.category || "").trim();
        if (!key) return acc;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      const categoryOps = Object.entries(categoryCounts).map(([name, count]) => ({
        updateOne: {
          filter: { name },
          update: { $inc: { count } },
          upsert: true,
        },
      }));

      if (categoryOps.length) {
        await Category.bulkWrite(categoryOps);
      }
    }

    return res.status(201).json({
      message: `Imported ${inserted.length} recipes successfully`,
      insertedCount: inserted.length,
      failedCount: errors.length,
      errors: errors.slice(0, 50),
    });
  } catch (err) {
    console.error("importRecipesBulk error:", err);
    return res.status(500).json({ message: "Failed to import recipes" });
  }
};

/**
 * Gửi thông báo khi một công thức của USER được duyệt.
 * Sẽ thông báo cho tác giả VÀ những người theo dõi tác giả.
 */
async function sendRecipeApprovalNotifications(recipe) {
  try {
    // Lấy thông tin tác giả
    const author = await User.findById(recipe.author);
    if (!author || author.role === 'admin') {
      // Nếu không tìm thấy tác giả, hoặc tác giả là admin (trường hợp này không nên xảy ra)
      // thì không gửi thông báo
      return; 
    }

    console.log(`[Notification] Sending approval notifications for recipe: ${recipe.name} by ${author.fullName}`);

    // 1. Thông báo cho TÁC GIẢ
    sendNotificationToExternalIds(
      [author._id.toString()],
      { en: "Your recipe is live!", vi: "Công thức của bạn đã được duyệt!" },
      { en: `Your recipe "${recipe.name}" has been approved.`, vi: `Công thức "${recipe.name}" của bạn đã được duyệt.` },
      { type: "recipe_approved", id: recipe._id.toString() }
    );
    // Lưu activity cho TÁC GIẢ
    await Activity.create({
      user: author._id,
      actor: author._id, // Tự mình
      type: "recipe_approved",
      entity: recipe._id,
      message: `Công thức "${recipe.name}" của bạn đã được duyệt.`
    });

    // 2. Thông báo cho NHỮNG NGƯỜI THEO DÕI (FOLLOWERS)
    const followers = author.followers || []; // Giả định model User có mảng 'followers'
    if (followers.length > 0) {
      
      // Tìm những follower CÓ BẬT thông báo
      const willingFollowers = await Notifications.find({
        user: { $in: followers },
        pushEnabled: true,
        newFollowers: true, // Giả định dùng chung setting 'newFollowers'
      }).select("user");
      
      const willingFollowerIds = willingFollowers.map(f => f.user);

      // Gửi Push Notification
      if (willingFollowerIds.length > 0) {
        sendNotificationToExternalIds(
          willingFollowerIds.map(id => id.toString()),
          { en: `New recipe from ${author.fullName}`, vi: `Công thức mới từ ${author.fullName}` },
          { en: recipe.name, vi: recipe.name },
          { type: "new_recipe", id: recipe._id.toString() }
        );
      }
      
      // Tạo Activity (Feed) cho TẤT CẢ followers
      const message = `${author.fullName} đã đăng công thức mới: ${recipe.name}`;
      const activityDocs = followers.map(userId => ({
        user: userId, // Người nhận (Follower)
        actor: recipe.author, // Người thực hiện (Tác giả)
        type: "new_recipe", 
        entity: recipe._id,
        message: message,
      }));
      await Activity.insertMany(activityDocs);
      console.log(`[Notification] Đã tạo ${activityDocs.length} feed activities cho followers.`);
    }
  } catch (notifError) {
    console.error(`[Notification] Lỗi khi gửi thông báo duyệt cho recipe ${recipe._id}:`, notifError);
  }
};

/**
 * Gửi thông báo khi một công thức của USER bị từ chối.
 */
async function sendRecipeRejectionNotifications(recipe) {
  try {
    // === LOG 1: Bắt đầu ===
    console.log(`[LOG] Bắt đầu sendRecipeRejectionNotifications cho Recipe ID: ${recipe._id}`);

    const author = await User.findById(recipe.author);

    // === LOG 2: Kiểm tra Tác giả ===
    if (!author) {
      console.error(`[LOG] LỖI: Không tìm thấy tác giả với ID: ${recipe.author}. Dừng gửi thông báo.`);
      return;
    }
    
    if (author.role === 'admin') {
      console.log(`[LOG] Tác giả là Admin (${author.fullName}). Không gửi thông báo (tự từ chối). Dừng.`);
      return; 
    }
    
    console.log(`[LOG] Tác giả là User: ${author.fullName}. Đang gửi thông báo TỪ CHỐI.`);

    // 1. Thông báo cho TÁC GIẢ
    sendNotificationToExternalIds(
      [author._id.toString()],
      { en: "Your recipe was rejected", vi: "Công thức của bạn đã bị từ chối" },
      { en: `Unfortunately, your recipe "${recipe.name}" was not approved.`, vi: `Rất tiếc, công thức "${recipe.name}" của bạn không được duyệt.` },
      { type: "recipe_rejected", id: recipe._id.toString() }
    );
    
    // 2. Lưu activity cho TÁC GIẢ
    await Activity.create({
      user: author._id,
      actor: author._id, // Tự mình
      type: "recipe_rejected",
      entity: recipe._id,
      message: `Công thức "${recipe.name}" của bạn đã bị từ chối.`
    });
    
    console.log(`[LOG] Đã lưu Activity TỪ CHỐI cho TÁC GIẢ.`);

  } catch (notifError) {
    console.error(`[LOG] LỖI NGHIÊM TRỌNG trong sendRecipeRejectionNotifications:`, notifError);
  }
};