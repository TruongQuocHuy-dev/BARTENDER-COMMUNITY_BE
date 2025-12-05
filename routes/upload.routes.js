import express from 'express';
import upload from '../middlewares/uploadMiddleware.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Single file upload
router.post('/image', protect, upload.single('file'), (req, res) => {
  res.json({ url: req.file.path });
});

export default router;
