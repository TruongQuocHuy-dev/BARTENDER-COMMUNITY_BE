// models/Recipe.js
import mongoose from 'mongoose';
import Favorite from './Favorite.js';

const ingredientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  amount: { type: String},
  unit: { type: String }
});

const recipeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    ingredients: [ingredientSchema],
    steps: [String],
    imageUrl: { type: String, default: '' },
    videoUrl: { type: String, default: '' },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    alcoholLevel: { type: String, enum: ['none', 'low', 'medium', 'high'], default: 'medium' },
    category: { type: String, required: true },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    likes: { type: Number, default: 0 },
    isPremium: { type: Boolean, default: false },
    rating: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'], // Các trạng thái có thể có
      default: 'pending', // Tự động đặt là 'pending' khi mới tạo
      index: true, // Thêm index để tăng tốc độ tìm kiếm (tốt cho hiệu năng)
    },
    reviewCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

recipeSchema.index({
  name: 'text',
  description: 'text',
  'ingredients.name': 'text' // Index cả tên của nguyên liệu con
});

// ✅ static methods (update theo _id)
recipeSchema.statics.createRecipe = async function (recipeData) {
  const recipe = new this(recipeData);
  await recipe.save();
  return recipe;
};

recipeSchema.statics.getAllRecipes = async function (filter = {}) {
  return this.find(filter).populate('author', 'fullName email avatarUrl');
};

recipeSchema.statics.getRecipeById = async function (recipeId) {
  const recipe = await this.findById(recipeId).populate('author', 'displayName username avatar');
  if (!recipe) throw new Error('Recipe not found');
  return recipe;
};

recipeSchema.statics.updateRecipe = async function (recipeId, updateData) {
  const recipe = await this.findByIdAndUpdate(recipeId, updateData, {
    new: true,
    runValidators: true
  });
  if (!recipe) throw new Error('Recipe not found');
  return recipe;
};

recipeSchema.statics.deleteRecipe = async function (recipeId) {
  const recipe = await this.findByIdAndDelete(recipeId);
  if (!recipe) throw new Error('Recipe not found');
  return recipe;
};

export default mongoose.model('Recipe', recipeSchema);
