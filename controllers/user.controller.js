import mongoose from "mongoose";
import User from "../models/User.js";
import Device from "../models/Device.js";
import Post from "../models/Post.js";
import Recipe from "../models/Recipe.js";
import Follow from "../models/Follow.js";
import { sendNotificationToExternalIds } from "../services/notification.service.js";
import Notifications from "../models/Notifications.js";
import Activity from "../models/Activity.js";

export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user._id; // ID from logged-in user token

    console.log("REQ.BODY:", req.body);
    console.log("REQ.FILE:", req.file);

    // Destructure fields from req.body, including email
    const { fullName, email, bio, phone, location, website } = req.body;

    // --- Considerations for Email Update ---
    // 1. Validation: Add validation to check if 'email' is a valid format.
    // 2. Uniqueness: Check if the new 'email' is already used by another user.
    // 3. Security: If email is used for login/recovery, consider adding verification
    //    steps before changing it (e.g., sending a confirmation link).
    // ---

    const updateFields = {
      // Use 'any' or define a specific type
      ...(fullName && { fullName }),
      ...(email && { email }), // Add email to fields to be updated
      ...(bio && { bio }),
      ...(phone && { phone }),
      ...(location && { location }),
      ...(website && { website }),
    };

    // Handle avatar upload
    if (req.file && req.file.path) {
      updateFields.avatarUrl = req.file.path;
    }

    // Prevent updating if updateFields is empty (optional but good practice)
    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ message: "No update fields provided" });
    }

    // Perform the update
    const updatedUser = await User.findByIdAndUpdate(userId, updateFields, {
      new: true, // Return the updated document
      runValidators: true, // Run schema validators (important if you add email validation)
      select: "fullName email avatarUrl bio phone location website", // Select fields to return
    });

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found after update" });
    }

    res.status(200).json({ user: updatedUser });
  } catch (err) {
    // Type the error if using TypeScript
    console.error("Update user profile error:", err);
    // Handle potential duplicate key error for email
    if (err.code === 11000 && err.keyPattern?.email) {
      return res.status(400).json({ message: "Email already in use" });
    }
    res
      .status(500)
      .json({ message: "Internal server error", error: err.message });
  }
};

/**
 * LẤY PROFILE CÔNG KHAI (Đã cập nhật)
 * GET /api/users/:userId
 */
export const getUserProfile = async (req, res) => {
  console.log(`[getUserProfile] Starting for userId: ${req.params.userId}`);
  try {
    const { userId } = req.params; // ID của profile đang xem
    const currentUserId = req.user?.id; // ID của người dùng đang request (nếu đã login)

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      /* ... invalid ID ... */
    }

    // Tìm user, chọn các trường cần thiết (bao gồm cả counts mới)
    const user = await User.findById(userId).select(
      "fullName email avatarUrl bio phone location website followersCount followingCount"
    );

    if (!user) {
      /* ... user not found ... */
    }
    console.log(`[getUserProfile] User found: ${user.email}`);

    // Đếm Post, Recipe (giữ nguyên)
    const postCount = await Post.countDocuments({ author: userId });
    const recipeCount = await Recipe.countDocuments({ author: userId });

    // --- KIỂM TRA TRẠNG THÁI FOLLOW ---
    let isFollowing = false;
    if (currentUserId && currentUserId !== userId) {
      // Chỉ kiểm tra nếu có người dùng login và không phải trang của chính họ
      const followRelationship = await Follow.findOne({
        follower: currentUserId,
        following: userId,
      });
      isFollowing = !!followRelationship; // true nếu tìm thấy, false nếu không
      console.log(
        `[getUserProfile] Current user (${currentUserId}) following ${userId}? ${isFollowing}`
      );
    }
    // ---------------------------------

    const profileData = {
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      bio: user.bio || "",
      phone: user.phone || "",
      location: user.location || "",
      website: user.website || "",
      postCount: postCount,
      recipeCount: recipeCount,
      followersCount: user.followersCount ?? 0, // Lấy từ user document
      followingCount: user.followingCount ?? 0, // Lấy từ user document
      isFollowing: isFollowing, // <-- Trả về trạng thái follow
    };

    console.log(`[getUserProfile] Sending response for user: ${user.username}`);
    res.status(200).json(profileData);
  } catch (err) {
    console.error("[getUserProfile] CRITICAL ERROR:", err); // Log the full error
    res.status(500).json({
      message: "Internal server error while getting profile",
      error: err.message,
    });
  }
};

export const saveDeviceInfo = async (req, res) => {
  try {
    const { name, os, browser, ip, location, current } = req.body;
    const userId = req.user._id;

    // 🔑 Check theo user + device name + os + browser (ổn định hơn ip)
    const device = await Device.findOneAndUpdate(
      { user: userId, name, os, browser },
      {
        $set: {
          user: userId,
          name,
          os,
          browser,
          ip,
          location,
          current,
          lastActive: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    res.json(device);
  } catch (err) {
    console.error("Save device info error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const getUserStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const deviceCount = await Device.countDocuments({ user: userId });

    res.json({ deviceCount });
  } catch (err) {
    console.error("getUserStats error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Dùng cho "Edit Profile"
export const getMyProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select(
      "fullName email avatarUrl bio phone location website"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // --- WRAP RESPONSE IN { user: ... } ---
    res.status(200).json({
      user: {
        // <-- Add this user key
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        phone: user.phone,
        location: user.location,
        website: user.website,
      },
    });
    // ------------------------------------
  } catch (err) {
    console.error("Get my profile error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * THEO DÕI MỘT USER
 * POST /api/users/:userId/follow
 */
export const followUser = async (req, res) => {
  const userIdToFollow = req.params.userId; // Người muốn theo dõi
  const currentUserId = req.user.id; // Người thực hiện theo dõi (từ middleware protect)

  console.log(
    `[followUser] User ${currentUserId} attempting to follow ${userIdToFollow}`
  );

  if (userIdToFollow === currentUserId) {
    return res.status(400).json({ message: "You cannot follow yourself" });
  }
  if (!mongoose.Types.ObjectId.isValid(userIdToFollow)) {
    return res.status(400).json({ message: "Invalid user ID to follow" });
  }

  try {
    // Kiểm tra xem user có tồn tại không
    const userToFollowExists = await User.findById(userIdToFollow).select(
      "_id"
    );
    if (!userToFollowExists) {
      return res.status(404).json({ message: "User to follow not found" });
    } // Kiểm tra xem đã follow chưa

    const existingFollow = await Follow.findOne({
      follower: currentUserId,
      following: userIdToFollow,
    });
    if (existingFollow) {
      console.log(`[followUser] Already following.`);
      return res.status(200).json({ message: "Already following" });
    } // Tạo mối quan hệ follow mới

    await Follow.create({ follower: currentUserId, following: userIdToFollow });
    console.log(`[followUser] Follow relationship created.`); // Cập nhật counts (dùng $inc để tăng)

    await User.findByIdAndUpdate(currentUserId, {
      $inc: { followingCount: 1 },
    });
    await User.findByIdAndUpdate(userIdToFollow, {
      $inc: { followersCount: 1 },
    });
    console.log(`[followUser] Counts updated.`); // ========================================================== // 👇 BẠN THÊM CODE VÀO ĐÂY // ==========================================================

    try {
      const recipientId = userIdToFollow.toString();
      const actorId = currentUserId.toString(); // 1. Kiểm tra cài đặt của người nhận

      const settings = await Notifications.findOne({
        user: recipientId,
        pushEnabled: true,
        newFollowers: true,
      });

      // 2. Tạo message
      const message = `${req.user.fullName} đã bắt đầu theo dõi bạn.`; // 3. Gửi Push (nếu cài đặt cho phép)

      if (settings) {
        sendNotificationToExternalIds(
          [recipientId],
          { en: "New Follower", vi: "Người theo dõi mới" },
          { en: `${req.user.fullName} started following you.`, vi: message },
          { type: "new_follower", actorId: actorId }
        );
      }

      // 4. Luôn lưu vào Activity
      await Activity.create({
        user: recipientId, // Người nhận (người được follow)
        actor: actorId, // Người thực hiện (người đi follow)
        type: "new_follower",
        entity: actorId, // ID của người đi follow
        message: message,
      });
    } catch (notifError) {
      console.error("Lỗi khi gửi thông báo 'new_follower':", notifError);
      // Chỉ log lỗi, không làm hỏng request 'follow'
    } // ========================================================== // 👆 KẾT THÚC PHẦN CODE MỚI // ==========================================================
    res.status(201).json({ message: "Successfully followed user" });
  } catch (err) {
    console.error("[followUser] Error:", err); // Handle potential unique index violation if race condition occurs
    if (err.code === 11000) {
      return res
        .status(200)
        .json({ message: "Already following (concurrent request)" });
    }
    res
      .status(500)
      .json({ message: "Failed to follow user", error: err.message });
  }
};

/**
 * BỎ THEO DÕI MỘT USER
 * DELETE /api/users/:userId/follow
 */
export const unfollowUser = async (req, res) => {
  const userIdToUnfollow = req.params.userId; // Người muốn bỏ theo dõi
  const currentUserId = req.user.id; // Người thực hiện (từ middleware protect)

  console.log(
    `[unfollowUser] User ${currentUserId} attempting to unfollow ${userIdToUnfollow}`
  );

  if (userIdToUnfollow === currentUserId) {
    return res.status(400).json({ message: "You cannot unfollow yourself" });
  }
  if (!mongoose.Types.ObjectId.isValid(userIdToUnfollow)) {
    return res.status(400).json({ message: "Invalid user ID to unfollow" });
  }

  try {
    // Tìm và xóa mối quan hệ follow
    const deletedFollow = await Follow.findOneAndDelete({
      follower: currentUserId,
      following: userIdToUnfollow,
    });

    if (!deletedFollow) {
      // Nếu không tìm thấy tức là chưa follow hoặc đã unfollow rồi
      console.log(`[unfollowUser] Not following or already unfollowed.`);
      return res.status(404).json({ message: "Not following this user" });
      // Hoặc trả về 200 OK nếu không coi đây là lỗi
      // return res.status(200).json({ message: "Not following this user" });
    }

    console.log(`[unfollowUser] Follow relationship deleted.`);

    // Cập nhật counts (dùng $inc với giá trị âm để giảm)
    // Chỉ giảm nếu việc xóa thành công
    await User.findByIdAndUpdate(currentUserId, {
      $inc: { followingCount: -1 },
    });
    await User.findByIdAndUpdate(userIdToUnfollow, {
      $inc: { followersCount: -1 },
    });
    console.log(`[unfollowUser] Counts updated.`);

    res.status(200).json({ message: "Successfully unfollowed user" }); // Hoặc 204 No Content
  } catch (err) {
    console.error("[unfollowUser] Error:", err);
    res
      .status(500)
      .json({ message: "Failed to unfollow user", error: err.message });
  }
};

/**
 * @desc    Lấy danh sách người dùng đã bị chặn bởi user hiện tại
 * @route   GET /api/users/blocked
 * @access  Private
 */
export const getBlockedUsersList = async (req, res) => {
  try {
    // req.user.id được gán từ middleware 'protect'
    const user = await User.findById(req.user.id).populate({
      path: "blockedUsers",
      select: "_id fullName avatarUrl", // Chỉ lấy các trường cần thiết
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user.blockedUsers || []); // Trả về danh sách đã populate
  } catch (error) {
    console.error("Failed to get blocked users list:", error);
    res.status(500).json({ message: "Server error" });
  }
};
