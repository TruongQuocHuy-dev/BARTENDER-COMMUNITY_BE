import Banner from "../models/Banner.js";
import mongoose from "mongoose";

export const createBanner = async (req, res) => {
  try {
    // Validate required fields
    const {
      title,
      description,
      link,
      highlights,
      contentDetail,
      status,
      priority,
      startDate,
      endDate,
    } = req.body;

    if (!title || !description || !link) {
      return res.status(400).json({
        message: "Title, description and link are required",
      });
    }

    // Check if image was uploaded
    if (!req.file) {
      return res.status(400).json({
        message: "Banner image is required",
      });
    }

    // Parse highlights if it's a string
    let parsedHighlights = highlights;
    try {
      if (typeof highlights === "string") {
        parsedHighlights = JSON.parse(highlights);
      }
    } catch (e) {
      console.log("Error parsing highlights:", e);
      parsedHighlights = [];
    }

    // Create banner with auto-generated ID
    const banner = await Banner.create({
      title,
      description,
      imageUrl: req.file.path,
      link,
      highlights: Array.isArray(parsedHighlights) ? parsedHighlights : [],
      contentDetail,
      status: status || "active",
      priority: priority || 0,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    });

    res.status(201).json(banner);
  } catch (err) {
    console.error("Error creating banner:", err);
    res.status(500).json({
      message: "Error creating banner",
      error: err.message,
    });
  }
};

export const getAllBanners = async (req, res) => {
  try {
    const { status, sort = "-createdAt" } = req.query;

    // Build query
    const query = {};
    if (status) {
      query.status = status;
    }

    // Add date filter for active banners
    if (status === "active") {
      const now = new Date();
      query.$or = [
        // No dates specified
        { startDate: null, endDate: null },
        // Within date range
        {
          $and: [{ startDate: { $lte: now } }, { endDate: { $gte: now } }],
        },
        // Only start date
        {
          startDate: { $lte: now },
          endDate: null,
        },
        // Only end date
        {
          startDate: null,
          endDate: { $gte: now },
        },
      ];
    }

    // Execute query with sorting
    const banners = await Banner.find(query).sort(sort).select("-__v");

    res.json(banners);
  } catch (err) {
    console.error("Error getting banners:", err);
    res.status(500).json({
      message: "Error retrieving banners",
      error: err.message,
    });
  }
};

export const getBannerById = async (req, res) => {
  try {
    // Sử dụng findByIdAndUpdate thay vì findById và save
    const banner = await Banner.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } }, // $inc: Tăng giá trị 'views' lên 1
      { new: true } // 'new: true' để trả về tài liệu đã được cập nhật
    );
    if (!banner) {
      return res.status(404).json({
        message: "Banner not found",
      });
    }

    // Dữ liệu trả về bây giờ sẽ có 'views' đã tăng
    // nhưng 'updatedAt' gốc vẫn được giữ nguyên
    res.json(banner);
  } catch (err) {
    console.error("Error getting banner:", err);
    res.status(500).json({
      message: "Error retrieving banner",
      error: err.message,
    });
  }
};

export const updateBanner = async (req, res) => {
  try {
    console.log("Updating banner with ID:", req.params.id);
    const {
      title,
      description,
      link,
      highlights,
      contentDetail,
      status,
      priority,
      startDate,
      endDate,
    } = req.body;

    const updateData = {
      title,
      description,
      link,
      highlights: highlights ? JSON.parse(highlights) : [],
      contentDetail,
      status,
      priority,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    };

    // Update image if provided
    if (req.file) {
      updateData.imageUrl = req.file.path;
    }

    // Update banner using MongoDB _id
    const banner = await Banner.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!banner) {
      console.log("Banner not found with ID:", req.params.id);
      return res.status(404).json({
        message: "Banner not found",
        providedId: req.params.id,
      });
    }

    console.log("Banner updated successfully:", banner);
    res.json(banner);
  } catch (err) {
    console.error("Error updating banner:", err);
    res.status(500).json({
      message: "Error updating banner",
      error: err.message,
      details: err.stack,
    });
  }
};

export const deleteBanner = async (req, res) => {
  try {
    await Banner.findByIdAndDelete(req.params.id);
    res.json({ message: "Banner deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
