// models/Category.js
import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    image: { type: String, required: true },
    count: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);

// BỎ HOÀN TOÀN 'categorySchema.statics.createCategory' VÌ NÓ KHÔNG ĐƯỢC DÙNG
// VÀ LOGIC CHECK 'id' CỦA NÓ BỊ SAI (XEM MỤC 2)

categorySchema.statics.getAllCategories = async function () {
  return this.find();
};

categorySchema.statics.getCategoryById = async function (categoryId) {
  // SỬA: Dùng findById (cách 1) hoặc findOne({ _id: categoryId }) (cách 2)
  const category = await this.findById(categoryId);
  if (!category) throw new Error("Category not found");
  return category;
};

categorySchema.statics.updateCategory = async function (
  categoryId,
  updateData
) {
  // SỬA: Dùng findByIdAndUpdate
  const category = await this.findByIdAndUpdate(categoryId, updateData, {
    new: true,
    runValidators: true,
  });
  if (!category) throw new Error("Category not found");
  return category;
};

categorySchema.statics.deleteCategory = async function (categoryId) {
  // SỬA: Dùng findByIdAndDelete
  const category = await this.findByIdAndDelete(categoryId);
  if (!category) throw new Error("Category not found");
  return category;
};

export default mongoose.model("Category", categorySchema);
