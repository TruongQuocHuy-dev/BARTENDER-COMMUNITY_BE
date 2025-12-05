import Review from "../models/Review.js";
import Recipe from "../models/Recipe.js";
import mongoose from "mongoose";
import { checkContentWithGemini } from "../services/contentFilter.service.js";


// --- HÀM HELPER: Tự động tính lại Rating & ReviewCount cho Recipe ---
const updateRecipeStats = async (recipeId) => {
  try {
    const stats = await Review.aggregate([
      {
        $match: { recipeId: new mongoose.Types.ObjectId(recipeId) },
      },
      {
        $group: {
          _id: "$recipeId",
          nRating: { $sum: 1 },
          avgRating: { $avg: "$rating" },
        },
      },
    ]);

    if (stats.length > 0) {
      await Recipe.findByIdAndUpdate(recipeId, {
        rating: stats[0].avgRating,
        reviewCount: stats[0].nRating,
      });
    } else {
      // Nếu không còn review nào, reset về 0
      await Recipe.findByIdAndUpdate(recipeId, {
        rating: 0,
        reviewCount: 0,
      });
    }
  } catch (err) {
    console.error("Lỗi khi update stats recipe:", err);
  }
};

// Lấy danh sách review theo recipeId
const getReviewsByRecipeId = async (req, res) => {
  try {
    const { recipeId } = req.params

    if (!mongoose.Types.ObjectId.isValid(recipeId)) {
      return res.status(400).json({ message: 'Invalid recipeId' })
    }

    const reviews = await Review.find({ recipeId })
      .populate('userId', 'fullName displayName avatarUrl')
      .sort({ createdAt: -1 })

    // ⚡ Nếu chưa có review => trả về []
    if (!reviews || reviews.length === 0) {
      return res.json([])
    }

    const formattedReviews = reviews.map(r => ({
  id: r._id.toString(),
  recipeId: r.recipeId.toString(),
  rating: r.rating,
  comment: r.comment,
  createdAt: r.createdAt,
  user: {
    id: r.userId?._id,
    fullName: r.userId?.fullName,
    email: r.userId?.email,
    avatarUrl: r.userId?.avatarUrl || null,
  },
  helpful: r.helpful,
  isHelpful: req.user && r.helpfulUsers.some(u => u.toString() === req.user.id),
}))


    return res.json(formattedReviews)
  } catch (error) {
    console.error('Error fetching reviews:', error)
    res.status(500).json({ message: 'Lỗi khi lấy reviews', error: error.message })
  }
}


// Tạo review
const createReview = async (req, res) => {
  try {
    const { recipeId, rating, comment } = req.body

    if (!mongoose.Types.ObjectId.isValid(recipeId)) {
      return res.status(400).json({ message: 'Invalid recipeId' })
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' })
    }

    if (comment && comment.trim().length > 0) {
        const checkResult = await checkContentWithGemini(comment);
        
        if (!checkResult.isSafe) {
            return res.status(400).json({ 
                message: `Nội dung không phù hợp: ${checkResult.reason}` 
            });
        }
    }

    // 🟢 BƯỚC 2: NẾU AN TOÀN THÌ LƯU
    const review = new Review({
      recipeId,
      userId: req.user.id,
      rating,
      comment,
    }); 
    

    await review.save()
    await updateRecipeStats(recipeId);

    res.status(201).json({
      id: review._id,
      recipeId: review.recipeId,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt,
      user: {
        id: req.user.id,
        username: req.user.username,
        displayName: req.user.displayName,
        avatar: req.user.avatar || null,
      },
    })
  } catch (error) {
    console.error('Error creating review:', error)
    res.status(500).json({ message: 'Lỗi khi tạo review', error: error.message })
  }
}

// Cập nhật review
const updateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;

    if (comment && comment.trim().length > 0) {
        const checkResult = await checkContentWithGemini(comment);
        
        if (!checkResult.isSafe) {
            return res.status(400).json({ 
                message: `Nội dung không phù hợp: ${checkResult.reason}` 
            });
        }
    }

    const review = await Review.findOneAndUpdate(
      { _id: id, userId: req.user.id }, // ✅ chỉ update review của chính user
      { $set: { rating, comment } },
      { new: true }
    );

    if (!review) {
      return res
        .status(404)
        .json({ message: "Review not found or not authorized" });
    }
    await updateRecipeStats(review.recipeId);

    res.json({
      id: review._id.toString(),
      _id: review._id.toString(),
      recipeId: review.recipeId.toString(),
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt,
      user: {
        id: req.user.id,
        displayName: req.user.displayName,
        avatarUrl: req.user.avatarUrl || null,
      },
      helpful: review.helpful,
      isHelpful: review.helpfulUsers.includes(req.user.id),
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};



// Xóa review
const deleteReview = async (req, res) => {
  try {
    const reviewId = req.params.id
    const review = await Review.findById(reviewId)
    if (!review) return res.status(404).json({ message: "Review not found" })

    // ✅ chỉ cho chủ review xóa
    if (review.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to delete this review" })
    }

    const recipeId = review.recipeId;
    await review.deleteOne()

    // update lại reviewCount
    await updateRecipeStats(recipeId);

    res.json({ message: "Review deleted successfully", id: reviewId })
  } catch (error) {
    res.status(500).json({ message: "Server error", error })
  }
}


// Toggle hữu ích
const toggleHelpfulReview = async (req, res) => {
  try {
    const reviewId = req.params.id
    const { isHelpful } = req.body
    const userId = req.user.id

    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
      return res.status(400).json({ message: "Invalid reviewId" })
    }

    const review = await Review.findById(reviewId)
    if (!review) return res.status(404).json({ message: "Review not found" })

    if (isHelpful) {
      // Thêm user vào danh sách helpful nếu chưa có
      if (!review.helpfulUsers.includes(userId)) {
        review.helpfulUsers.push(userId)
        review.helpful += 1
      }
    } else {
      // Gỡ user khỏi danh sách helpful
      review.helpfulUsers = review.helpfulUsers.filter(
        (uid) => uid.toString() !== userId
      )
      review.helpful = Math.max(0, review.helpful - 1)
    }

    await review.save()

    res.json({
      id: review._id.toString(),
      helpful: review.helpful,
      isHelpful: review.helpfulUsers.includes(userId),
    })
  } catch (error) {
    console.error("Error toggling helpful:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export {
  getReviewsByRecipeId,
  createReview,
  updateReview,
  deleteReview,
  toggleHelpfulReview,
};

