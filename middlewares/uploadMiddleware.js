// uploadMiddleware.js
import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinary from '../utils/cloudinary.js';

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    // Determine resource type and allowed formats based on field name
    const isVideo = file.fieldname === 'videoFile';
    return {
      folder: 'bartender-recipes',
      resource_type: isVideo ? 'video' : 'image',
      allowed_formats: isVideo ? ['mp4', 'webm'] : ['jpg', 'jpeg', 'png', 'webp'],
      public_id: `${Date.now()}-${file.originalname}`,
    };
  },
});

// File filter function
const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'imageFile') {
    // Check if it's an image
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed for imageFile'), false);
      return;
    }
  } else if (file.fieldname === 'videoFile') {
    // Check if it's a video
    if (!file.mimetype.startsWith('video/')) {
      cb(new Error('Only video files are allowed for videoFile'), false);
      return;
    }
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max file size
  }
});

export default upload;
