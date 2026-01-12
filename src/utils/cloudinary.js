const cloudinary = require('../config/cloudinary');

/**
 * Upload image to Cloudinary
 * @param {Buffer} fileBuffer - File buffer from multer
 * @param {string} uploadType - Type of upload: 'profile', 'event', 'listing', 'post'
 * @param {string} userId - User ID for organizing uploads
 * @returns {Promise<string>} - Cloudinary secure URL
 */
const uploadToCloudinary = (fileBuffer, uploadType, userId) => {
  return new Promise((resolve, reject) => {
    // Define folder structure based on upload type
    const folder = `chicago-nigeria/${uploadType}s`;

    // Create upload stream
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: 'image',
        public_id: `${userId}-${Date.now()}`,
        transformation: [
          { width: 1000, height: 1000, crop: 'limit' }, // Max dimensions
          { quality: 'auto' }, // Auto quality optimization
          { fetch_format: 'auto' }, // Auto format (WebP, etc.)
        ],
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          reject(new Error('Failed to upload image to Cloudinary'));
        } else {
          resolve(result.secure_url);
        }
      }
    );

    // Write buffer to stream
    uploadStream.end(fileBuffer);
  });
};

/**
 * Delete image from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<void>}
 */
const deleteFromCloudinary = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw new Error('Failed to delete image from Cloudinary');
  }
};

/**
 * Extract public ID from Cloudinary URL
 * @param {string} url - Cloudinary secure URL
 * @returns {string} - Public ID
 */
const getPublicIdFromUrl = (url) => {
  if (!url) return null;

  // Extract public ID from Cloudinary URL
  // Example: https://res.cloudinary.com/demo/image/upload/v1234/chicago-nigeria/profiles/user123-1234567890.jpg
  const matches = url.match(/\/chicago-nigeria\/[^/]+\/([^/.]+)/);
  return matches ? `chicago-nigeria/${matches[0].split('/').slice(-2).join('/')}` : null;
};

module.exports = {
  uploadToCloudinary,
  deleteFromCloudinary,
  getPublicIdFromUrl,
};
