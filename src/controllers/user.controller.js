const prisma = require('../config/prisma');
const { uploadToCloudinary, getPublicIdFromUrl, deleteFromCloudinary } = require('../utils/cloudinary');

const userController = {
  getProfile: async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: {
          preferences: true,
        },
      });

      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  },

  updateProfile: async (req, res, next) => {
    try {
      const { firstName, lastName, email, phone, profession, company, bio, location } = req.body;

      const user = await prisma.user.update({
        where: { id: req.user.id },
        data: {
          firstName,
          lastName,
          email,
          phone,
          profession,
          company,
          bio,
          location,
        },
      });

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: user,
      });
    } catch (error) {
      next(error);
    }
  },

  updateProfilePhoto: async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded',
        });
      }

      // Get the current user to check for existing photo
      const currentUser = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { photo: true },
      });

      // Delete old photo from Cloudinary if it exists
      if (currentUser.photo) {
        const publicId = getPublicIdFromUrl(currentUser.photo);
        if (publicId) {
          try {
            await deleteFromCloudinary(publicId);
          } catch (deleteError) {
            console.error('Failed to delete old photo:', deleteError);
            // Continue even if deletion fails
          }
        }
      }

      // Upload new photo to Cloudinary
      const photoUrl = await uploadToCloudinary(
        req.file.buffer,
        'profile',
        req.user.id
      );

      // Update user profile with new photo URL
      const user = await prisma.user.update({
        where: { id: req.user.id },
        data: {
          photo: photoUrl,
        },
        select: {
          id: true,
          photo: true,
        },
      });

      res.json({
        success: true,
        message: 'Profile photo updated successfully',
        data: { photo: user.photo },
      });
    } catch (error) {
      next(error);
    }
  },

  updatePreferences: async (req, res, next) => {
    try {
      const preferences = await prisma.userPreferences.upsert({
        where: { userId: req.user.id },
        update: req.body,
        create: {
          userId: req.user.id,
          ...req.body,
        },
      });

      res.json({
        success: true,
        message: 'Preferences updated',
        data: preferences,
      });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = userController;
