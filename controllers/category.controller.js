// controllers/categoryController.js
import mongoose from "mongoose";
import Category from "../models/Category.js";
import Recipe from "../models/Recipe.js"; // nếu Recipe cũng là ES Module

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
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Category name is required" });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Category image is required" });
    }

    const image = req.file.path;
    // Dùng Category.create là đúng rồi
    const category = await Category.create({
      name,
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
    const { name } = req.body;
    const updateData = { name };
    if (req.file) {
      updateData.image = req.file.path;
    }

    // THÊM: Lấy thông tin category cũ trước khi cập nhật
    const oldCategory = await Category.getCategoryById(categoryId); // Dùng hàm static đã sửa
    if (!oldCategory) {
      return res.status(404).json({ message: "Category not found" });
    }

    const category = await Category.updateCategory(categoryId, updateData); // Dùng hàm static đã sửa

    // THÊM: Nếu tên đã thay đổi, cập nhật tất cả Recipe liên quan
    if (name && name !== oldCategory.name) {
      await Recipe.updateMany(
        { category: oldCategory.name },
        { $set: { category: name } }
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
