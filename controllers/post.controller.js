import Post from "../models/Post.js";
import mongoose from "mongoose";
import User from "../models/User.js";
import { sendNotificationToExternalIds } from "../services/notification.service.js";
import Notifications from "../models/Notifications.js";
import Follow from "../models/Follow.js";
import Activity from "../models/Activity.js";

// --- HÀM HELPER (KIỂM TRA ID) ---
const isValidId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

// 1. TẠO MỚI (Thêm post)
// POST /posts
export const createPost = async (req, res) => {
  try {
    const { caption } = req.body;
    const image = req.files?.imageFile?.[0];
    const video = req.files?.videoFile?.[0];

    // Schema mới dùng 'caption'
    const post = await Post.create({
      caption,
      imageUrl: image?.path || "",
      videoUrl: video?.path || "",
      author: req.user.id,
    });

    try {
      // 1. Lấy ID của người đăng bài
      const authorId = post.author;

      // 2. Tìm tất cả người theo dõi (followers) của tác giả
      const followers = await Follow.find({ following: authorId }).select(
        "follower"
      );
      const followerUserIds = followers.map((f) => f.follower);

      if (followerUserIds.length > 0) {
        // 3. Kiểm tra cài đặt của những người theo dõi
        const willingUsers = await Notifications.find({
          user: { $in: followerUserIds },
          pushEnabled: true,
          newPostsFromFollowing: true, // (Trường mới bạn vừa thêm)
        }).select("user");

        const finalUserIds = willingUsers.map((u) => u.user.toString());

        if (finalUserIds.length > 0) {
          // 4. Gửi thông báo
          console.log(
            `[Notification] Gửi thông báo bài viết mới đến ${finalUserIds.length} người theo dõi.`
          );
          sendNotificationToExternalIds(
            finalUserIds,
            {
              en: "New Post",
              vi: `${req.user.fullName} vừa đăng bài viết mới`,
            },
            { en: post.caption, vi: post.caption },
            { type: "new_post", id: post._id.toString() }
          );
        }
        const activities = followerUserIds.map(followerId => ({
          user: followerId,           // Người nhận (Follower)
          actor: req.user.id,         // Người đăng bài (User hiện tại)
          type: "new_post",           // Loại hoạt động
          entity: post._id,           // ID của bài viết
          message: `${req.user.fullName} vừa đăng bài viết mới`, // Nội dung thông báo
          createdAt: new Date(),
          isRead: false
        }));

        if (activities.length > 0) {
           await Activity.insertMany(activities);
        }
      }
    } catch (notifError) {
      console.error("Lỗi khi gửi thông báo 'bài viết mới':", notifError);
    }

    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ message: "Create post failed", error: err.message });
  }
};

// 2. LẤY TẤT CẢ (Danh sách post)
// GET /posts
export const getAllPosts = async (req, res) => {
  try {
    console.log("[postController.js] req.user:", req.user);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    let query = {};

    if (req.user) {
      const userId = req.user.id;
      const blockedUsersList = req.user.blockedUsers || [];

      query = {
        $and: [
          // 1. Tác giả không nằm trong danh sách chặn của user
          { author: { $nin: blockedUsersList } },
          // 2. Bài viết này không nằm trong danh sách "Không quan tâm" của user
          { notInterestedBy: { $nin: [userId] } },
        ],
      };
    }

    const posts = await Post.find(query)
      .populate("author", "fullName username avatarUrl")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    const totalPosts = await Post.countDocuments();
    res.status(200).json({
      data: posts,
      currentPage: page,
      totalPages: Math.ceil(totalPosts / limit),
      totalPosts,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Get all posts failed", error: err.message });
  }
};

// 3. LẤY THEO USER (Danh sách theo user)
// GET /users/:userId/posts
export const getPostsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!isValidId(userId)) {
      return res.status(400).json({ message: "Invalid User ID" });
    }
    const userExists = await User.findById(userId);
    if (!userExists) {
      return res.status(404).json({ message: "User not found" });
    }
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const posts = await Post.find({ author: userId })
      .populate("author", "fullName username avatarUrl")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    const totalPosts = await Post.countDocuments({ author: userId });
    res.status(200).json({
      data: posts,
      currentPage: page,
      totalPages: Math.ceil(totalPosts / limit),
      totalPosts,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Get posts by user failed", error: err.message });
  }
};

// 4. LẤY THEO ID POST (Chi tiết post)
// GET /posts/:postId
export const getPostById = async (req, res) => {
  try {
    const { postId } = req.params;
    if (!isValidId(postId)) {
      return res.status(400).json({ message: "Invalid Post ID" });
    }
    const post = await Post.findById(postId).populate(
      "author",
      "fullName username avatarUrl"
    );
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }
    res.status(200).json(post);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Get post details failed", error: err.message });
  }
};

// 5. CẬP NHẬT (Sửa post)
// PATCH /posts/:postId
// controllers/post.controller.js

export const updatePost = async (req, res) => {
  try {
    const { postId } = req.params;
    // Lấy thêm deleteImage, deleteVideo từ req.body (do Frontend gửi lên)
    const { caption, deleteImage, deleteVideo } = req.body;
    
    // Lấy file mới (nếu có)
    const image = req.files?.imageFile?.[0];
    const video = req.files?.videoFile?.[0];

    if (!isValidId(postId)) {
      return res.status(400).json({ message: "Invalid Post ID" });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (post.author.toString() !== req.user.id) {
      return res.status(403).json({ message: "Forbidden: You are not the author" });
    }

    // --- CẬP NHẬT LOGIC ---

    // 1. Cập nhật Caption (nếu có gửi lên)
    if (caption !== undefined) post.caption = caption;

    // 2. Xử lý ẢNH
    if (image) {
        // Trường hợp A: Có ảnh mới upload -> Ghi đè ảnh cũ
        post.imageUrl = image.path;
    } else if (deleteImage === 'true') {
        // Trường hợp B: Không có ảnh mới + Có cờ báo xóa -> Xóa ảnh trong DB
        post.imageUrl = ""; 
        // (Optional: Nếu muốn xóa file trên Cloudinary thì gọi hàm destroy ở đây)
    }

    // 3. Xử lý VIDEO
    if (video) {
        // Trường hợp A: Có video mới upload -> Ghi đè video cũ
        post.videoUrl = video.path;
    } else if (deleteVideo === 'true') {
        // Trường hợp B: Không có video mới + Có cờ báo xóa -> Xóa video trong DB
        post.videoUrl = "";
    }

    const updatedPost = await post.save();
    res.status(200).json(updatedPost);
  } catch (err) {
    res.status(500).json({ message: "Update post failed", error: err.message });
  }
};

// 6. XÓA (Xóa post)
// DELETE /posts/:postId
export const deletePost = async (req, res) => {
  try {
    const { postId } = req.params;

    if (!isValidId(postId)) {
      return res.status(400).json({ message: "Invalid Post ID" });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    } // --- SỬA Ở ĐÂY ---

    if (post.author.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ message: "Forbidden: You are not the author" });
    }

    await Post.findByIdAndDelete(postId);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: "Delete post failed", error: err.message });
  }
};

/**
 * LIKE / UNLIKE POST
 * POST /posts/:postId/likes
 */
export const likePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id; // Lấy từ middleware 'protect'

    if (!isValidId(postId)) {
      return res.status(400).json({ message: "Invalid Post ID" });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Kiểm tra xem user đã like chưa
    const alreadyLikedIndex = post.likes.findIndex(
      (likeId) => likeId.toString() === userId
    );

    if (alreadyLikedIndex > -1) {
      // Đã like -> Unlike
      post.likes.splice(alreadyLikedIndex, 1);
    } else {
      // Chưa like -> Like
      post.likes.push(userId);
    }

    await post.save();

    const isLiking = alreadyLikedIndex === -1;
    const recipientId = post.author.toString();

    // 1. Chỉ gửi thông báo khi 'like' (không gửi khi 'unlike')
    // 2. Không gửi thông báo nếu tự 'like' bài của mình
    if (isLiking && recipientId !== userId) {
      try {
        // 3. Kiểm tra cài đặt của người nhận
        const settings = await Notifications.findOne({
          user: recipientId,
          pushEnabled: true,
          likes: true,
        });

        if (settings) {
          // 4. Gửi bằng External ID
          const message = `${req.user.fullName} đã thích bài viết của bạn.`;
          sendNotificationToExternalIds(
            [recipientId],
            { en: "New Like", vi: "Lượt thích mới" },
            { en: `${req.user.fullName} liked your post.`, vi: message },
            { type: "new_like", id: post._id.toString() }
          );

          // 👇 === LƯU VÀO ACTIVITY === 👇
          await Activity.create({
            user: recipientId, // Người nhận
            actor: userId, // Người 'like'
            type: "new_like", // (Đã có trong enum của bạn)
            entity: post._id, // ID của bài post
            message: message,
          });
        }
      } catch (notifError) {
        console.error("Lỗi khi gửi thông báo 'like':", notifError);
      }
    }

    // Trả về trạng thái like mới và số lượng like
    res.status(200).json({
      isLiked: alreadyLikedIndex === -1, // true nếu vừa like, false nếu vừa unlike
      likeCount: post.likes.length,
    });
  } catch (err) {
    console.error("Like post error:", err);
    res.status(500).json({ message: "Like post failed", error: err.message });
  }
};
