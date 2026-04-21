// controllers/categoryController.js
import mongoose from "mongoose";
import Category from "../models/Category.js";
import Recipe from "../models/Recipe.js"; // nếu Recipe cũng là ES Module

const normalizeCategoryName = (value = "") =>
  String(value)
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const findCategoryByName = async (name, excludeId = null) => {
  const normalized = normalizeCategoryName(name);
  if (!normalized) return null;

  const categories = await Category.find({}, "_id name").lean();
  return (
    categories.find((category) => {
      if (excludeId && String(category._id) === String(excludeId)) return false;
      return normalizeCategoryName(category.name) === normalized;
    }) || null
  );
};

export const getAllCategories = async (req, res) => {
  try {
    const categories = await Category.getAllCategories();

    res.json(categories);
  } catch (error) {
    console.error("Error in getAllCategories:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getCategoryById = async (req, res) => {
  try {
    const categoryId = req.params.id;
    const category = await Category.getCategoryById(categoryId);
    // find recipes that belong to this category (recipes store category by name)
    const recipes = await Recipe.find({ category: category.name }).limit(200);
    res.json({ category, recipes });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const createCategory = async (req, res) => {
  try {
    const normalizedName = String(req.body?.name || "").trim().replace(/\s+/g, " ");
    if (!normalizedName) {
      return res.status(400).json({ message: "Category name is required" });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Category image is required" });
    }

    const duplicated = await findCategoryByName(normalizedName);
    if (duplicated) {
      return res.status(409).json({ message: `Category name already exists: ${duplicated.name}` });
    }

    const image = req.file.path;
    // Dùng Category.create là đúng rồi
    const category = await Category.create({
      name: normalizedName,
      image,
    });
    res.status(201).json(category);
  } catch (error) {
    // SỬA: Bắt lỗi E11000 khi tên bị trùng
    if (error.code === 11000) {
      return res.status(400).json({ message: "Category name already exists" });
    }
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const updateCategory = async (req, res) => {
  try {
    const categoryId = req.params.id;
    const rawName = String(req.body?.name || "").trim();
    const normalizedName = rawName ? rawName.replace(/\s+/g, " ") : "";
    const updateData = {};
    if (normalizedName) {
      updateData.name = normalizedName;
    }
    if (req.file) {
      updateData.image = req.file.path;
    }

    // THÊM: Lấy thông tin category cũ trước khi cập nhật
    const oldCategory = await Category.getCategoryById(categoryId); // Dùng hàm static đã sửa
    if (!oldCategory) {
      return res.status(404).json({ message: "Category not found" });
    }

    if (normalizedName) {
      const duplicated = await findCategoryByName(normalizedName, categoryId);
      if (duplicated) {
        return res.status(409).json({ message: `Category name already exists: ${duplicated.name}` });
      }
    }

    const category = await Category.updateCategory(categoryId, updateData); // Dùng hàm static đã sửa

    // THÊM: Nếu tên đã thay đổi, cập nhật tất cả Recipe liên quan
    if (normalizedName && normalizedName !== oldCategory.name) {
      await Recipe.updateMany(
        { category: oldCategory.name },
        { $set: { category: normalizedName } }
      );
    }

    res.json(category);
  } catch (error) {
    // THÊM: Bắt lỗi trùng tên khi update
    if (error.code === 11000) {
      return res.status(400).json({ message: "Category name already exists" });
    }
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    const categoryId = req.params.id;
    const category = await Category.deleteCategory(categoryId);
    await Recipe.updateMany(
      { category: category.name },
      { $set: { category: null } }
    );
    res.json({ message: "Category deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
