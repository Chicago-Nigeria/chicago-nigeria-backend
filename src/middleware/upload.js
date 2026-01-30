const multer = require('multer');
const path = require('path');

// Configure multer to use memory storage (for Cloudinary uploads)
// File buffer will be available in req.file.buffer
const storage = multer.memoryStorage();

// File filter to accept only images
const imageFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, JPG, PNG, GIF, WebP) are allowed'));
  }
};

// File filter to accept only videos
const videoFilter = (req, file, cb) => {
  const allowedTypes = /mp4|mov|avi|webm|mkv/;
  const mimeTypes = /video\/(mp4|quicktime|x-msvideo|webm|x-matroska)/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = mimeTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only video files (MP4, MOV, AVI, WebM, MKV) are allowed'));
  }
};

// Combined media filter (images + videos)
const mediaFilter = (req, file, cb) => {
  const imageTypes = /jpeg|jpg|png|gif|webp/;
  const videoTypes = /mp4|mov|avi|webm|mkv/;
  const videoMimeTypes = /video\/(mp4|quicktime|x-msvideo|webm|x-matroska)/;

  const ext = path.extname(file.originalname).toLowerCase().slice(1);

  // Check if it's an image
  if (imageTypes.test(ext) || imageTypes.test(file.mimetype)) {
    file.mediaType = 'image';
    return cb(null, true);
  }

  // Check if it's a video
  if (videoTypes.test(ext) || videoMimeTypes.test(file.mimetype)) {
    file.mediaType = 'video';
    return cb(null, true);
  }

  cb(new Error('Only image (JPEG, JPG, PNG, GIF, WebP) or video (MP4, MOV, AVI, WebM, MKV) files are allowed'));
};

// Configure multer upload for images only (5MB limit)
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
  },
  fileFilter: imageFilter,
});

// Configure multer upload for videos only (100MB limit)
const uploadVideo = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max file size
  },
  fileFilter: videoFilter,
});

// Configure multer upload for media (images + videos, 100MB limit)
const uploadMedia = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max file size for videos
  },
  fileFilter: mediaFilter,
});

module.exports = { upload, uploadVideo, uploadMedia };
