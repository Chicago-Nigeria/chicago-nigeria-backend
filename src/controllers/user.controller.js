const prisma = require('../config/prisma');
const { uploadToCloudinary, getPublicIdFromUrl, deleteFromCloudinary } = require('../utils/cloudinary');

const userController = {
  // Get public user profile by ID
  getPublicProfile: async (req, res, next) => {
    try {
      const { id } = req.params;
      const currentUserId = req.user?.id;

      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          photo: true,
          headerImage: true,
          bio: true,
          location: true,
          profession: true,
          company: true,
          createdAt: true,
          _count: {
            select: {
              followers: true,
              following: true,
              posts: true,
              events: true,
              listings: true,
            },
          },
        },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      // Check if current user follows this user
      let isFollowing = false;
      if (currentUserId && currentUserId !== id) {
        const follow = await prisma.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: currentUserId,
              followingId: id,
            },
          },
        });
        isFollowing = !!follow;
      }

      res.json({
        success: true,
        data: {
          ...user,
          isFollowing,
          isOwnProfile: currentUserId === id,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Get user's posts
  getUserPosts: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { cursor, limit = 10 } = req.query;
      const currentUserId = req.user?.id;

      const posts = await prisma.post.findMany({
        where: { authorId: id },
        take: parseInt(limit) + 1,
        ...(cursor && {
          cursor: { id: cursor },
          skip: 1,
        }),
        orderBy: { createdAt: 'desc' },
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              photo: true,
              profession: true,
              location: true,
            },
          },
          _count: {
            select: {
              likes: true,
              comments: true,
              saves: true,
            },
          },
          ...(currentUserId && {
            likes: {
              where: { userId: currentUserId },
              select: { id: true },
            },
            saves: {
              where: { userId: currentUserId },
              select: { id: true },
            },
          }),
        },
      });

      const hasMore = posts.length > parseInt(limit);
      const data = hasMore ? posts.slice(0, -1) : posts;

      // Check if current user follows this profile's user
      let isFollowingAuthor = false;
      if (currentUserId && currentUserId !== id) {
        const follow = await prisma.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: currentUserId,
              followingId: id,
            },
          },
        });
        isFollowingAuthor = !!follow;
      }

      // Format posts with isLiked, isSaved, and author.isFollowing flags
      const formattedPosts = data.map((post) => ({
        ...post,
        author: {
          ...post.author,
          isFollowing: isFollowingAuthor,
        },
        isLiked: currentUserId ? post.likes?.length > 0 : false,
        isSaved: currentUserId ? post.saves?.length > 0 : false,
        likes: undefined,
        saves: undefined,
      }));

      res.json({
        success: true,
        data: formattedPosts,
        meta: {
          hasMore,
          nextCursor: hasMore ? data[data.length - 1]?.id : null,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Get user's events (events they're hosting)
  getUserEvents: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { cursor, limit = 10 } = req.query;

      const events = await prisma.event.findMany({
        where: {
          organizerId: id,
          status: { in: ['upcoming', 'ongoing', 'completed'] },
        },
        take: parseInt(limit) + 1,
        ...(cursor && {
          cursor: { id: cursor },
          skip: 1,
        }),
        orderBy: { startDate: 'desc' },
        include: {
          organizer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              photo: true,
            },
          },
          _count: {
            select: {
              tickets: true,
              registrations: true,
              likes: true,
            },
          },
        },
      });

      const hasMore = events.length > parseInt(limit);
      const data = hasMore ? events.slice(0, -1) : events;

      res.json({
        success: true,
        data,
        meta: {
          hasMore,
          nextCursor: hasMore ? data[data.length - 1]?.id : null,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Get user's marketplace listings
  getUserListings: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { cursor, limit = 10 } = req.query;

      const listings = await prisma.listing.findMany({
        where: {
          sellerId: id,
          status: { in: ['active', 'sold'] },
        },
        take: parseInt(limit) + 1,
        ...(cursor && {
          cursor: { id: cursor },
          skip: 1,
        }),
        orderBy: { createdAt: 'desc' },
        include: {
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              photo: true,
            },
          },
          _count: {
            select: {
              likes: true,
              saves: true,
              comments: true,
              views: true,
            },
          },
        },
      });

      const hasMore = listings.length > parseInt(limit);
      const data = hasMore ? listings.slice(0, -1) : listings;

      res.json({
        success: true,
        data,
        meta: {
          hasMore,
          nextCursor: hasMore ? data[data.length - 1]?.id : null,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Get user's followers
  getFollowers: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { cursor, limit = 20 } = req.query;
      const currentUserId = req.user?.id;

      const followers = await prisma.follow.findMany({
        where: { followingId: id },
        take: parseInt(limit) + 1,
        ...(cursor && {
          cursor: { id: cursor },
          skip: 1,
        }),
        orderBy: { createdAt: 'desc' },
        include: {
          follower: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              photo: true,
              profession: true,
              location: true,
            },
          },
        },
      });

      const hasMore = followers.length > parseInt(limit);
      const data = hasMore ? followers.slice(0, -1) : followers;

      // Check if current user follows each follower
      let followingIds = [];
      if (currentUserId) {
        const following = await prisma.follow.findMany({
          where: {
            followerId: currentUserId,
            followingId: { in: data.map((f) => f.follower.id) },
          },
          select: { followingId: true },
        });
        followingIds = following.map((f) => f.followingId);
      }

      const formattedFollowers = data.map((f) => ({
        ...f.follower,
        isFollowing: followingIds.includes(f.follower.id),
      }));

      res.json({
        success: true,
        data: formattedFollowers,
        meta: {
          hasMore,
          nextCursor: hasMore ? data[data.length - 1]?.id : null,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Get user's following
  getFollowing: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { cursor, limit = 20 } = req.query;
      const currentUserId = req.user?.id;

      const following = await prisma.follow.findMany({
        where: { followerId: id },
        take: parseInt(limit) + 1,
        ...(cursor && {
          cursor: { id: cursor },
          skip: 1,
        }),
        orderBy: { createdAt: 'desc' },
        include: {
          following: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              photo: true,
              profession: true,
              location: true,
            },
          },
        },
      });

      const hasMore = following.length > parseInt(limit);
      const data = hasMore ? following.slice(0, -1) : following;

      // Check if current user follows each user in the list
      let followingIds = [];
      if (currentUserId) {
        const currentUserFollowing = await prisma.follow.findMany({
          where: {
            followerId: currentUserId,
            followingId: { in: data.map((f) => f.following.id) },
          },
          select: { followingId: true },
        });
        followingIds = currentUserFollowing.map((f) => f.followingId);
      }

      const formattedFollowing = data.map((f) => ({
        ...f.following,
        isFollowing: followingIds.includes(f.following.id),
      }));

      res.json({
        success: true,
        data: formattedFollowing,
        meta: {
          hasMore,
          nextCursor: hasMore ? data[data.length - 1]?.id : null,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Follow a user
  followUser: async (req, res, next) => {
    try {
      const { id } = req.params;
      const currentUserId = req.user.id;

      if (id === currentUserId) {
        return res.status(400).json({
          success: false,
          message: 'You cannot follow yourself',
        });
      }

      // Check if user exists
      const userExists = await prisma.user.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!userExists) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      // Check if already following
      const existingFollow = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: currentUserId,
            followingId: id,
          },
        },
      });

      if (existingFollow) {
        return res.status(400).json({
          success: false,
          message: 'You are already following this user',
        });
      }

      await prisma.follow.create({
        data: {
          followerId: currentUserId,
          followingId: id,
        },
      });

      // Get updated follower count
      const followerCount = await prisma.follow.count({
        where: { followingId: id },
      });

      res.json({
        success: true,
        message: 'User followed successfully',
        data: { followerCount },
      });
    } catch (error) {
      next(error);
    }
  },

  // Unfollow a user
  unfollowUser: async (req, res, next) => {
    try {
      const { id } = req.params;
      const currentUserId = req.user.id;

      if (id === currentUserId) {
        return res.status(400).json({
          success: false,
          message: 'You cannot unfollow yourself',
        });
      }

      const existingFollow = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: currentUserId,
            followingId: id,
          },
        },
      });

      if (!existingFollow) {
        return res.status(400).json({
          success: false,
          message: 'You are not following this user',
        });
      }

      await prisma.follow.delete({
        where: {
          followerId_followingId: {
            followerId: currentUserId,
            followingId: id,
          },
        },
      });

      // Get updated follower count
      const followerCount = await prisma.follow.count({
        where: { followingId: id },
      });

      res.json({
        success: true,
        message: 'User unfollowed successfully',
        data: { followerCount },
      });
    } catch (error) {
      next(error);
    }
  },

  // Update header image
  updateHeaderImage: async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded',
        });
      }

      // Get the current user to check for existing header image
      const currentUser = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { headerImage: true },
      });

      // Delete old header image from Cloudinary if it exists
      if (currentUser.headerImage) {
        const publicId = getPublicIdFromUrl(currentUser.headerImage);
        if (publicId) {
          try {
            await deleteFromCloudinary(publicId);
          } catch (deleteError) {
            console.error('Failed to delete old header image:', deleteError);
          }
        }
      }

      // Upload new header image to Cloudinary
      const headerImageUrl = await uploadToCloudinary(
        req.file.buffer,
        'headers',
        req.user.id
      );

      // Update user profile with new header image URL
      const user = await prisma.user.update({
        where: { id: req.user.id },
        data: {
          headerImage: headerImageUrl,
        },
        select: {
          id: true,
          headerImage: true,
        },
      });

      res.json({
        success: true,
        message: 'Header image updated successfully',
        data: { headerImage: user.headerImage },
      });
    } catch (error) {
      next(error);
    }
  },

  // Get suggested users to follow
  getSuggestions: async (req, res, next) => {
    try {
      const currentUserId = req.user.id;
      const { limit = 5 } = req.query;

      // Get users the current user is already following
      const followingIds = await prisma.follow.findMany({
        where: { followerId: currentUserId },
        select: { followingId: true },
      });
      const excludeIds = [currentUserId, ...followingIds.map((f) => f.followingId)];

      // Get the current user's location for location-based suggestions
      const currentUser = await prisma.user.findUnique({
        where: { id: currentUserId },
        select: { location: true },
      });

      // Find users from the same location who are not followed
      let suggestions = [];

      if (currentUser.location) {
        suggestions = await prisma.user.findMany({
          where: {
            id: { notIn: excludeIds },
            location: currentUser.location,
            isActive: true,
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            photo: true,
            profession: true,
            location: true,
          },
          take: parseInt(limit),
          orderBy: { createdAt: 'desc' },
        });
      }

      // If not enough suggestions from location, fill with random users
      if (suggestions.length < parseInt(limit)) {
        const additionalSuggestions = await prisma.user.findMany({
          where: {
            id: { notIn: [...excludeIds, ...suggestions.map((s) => s.id)] },
            isActive: true,
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            photo: true,
            profession: true,
            location: true,
          },
          take: parseInt(limit) - suggestions.length,
          orderBy: { createdAt: 'desc' },
        });
        suggestions = [...suggestions, ...additionalSuggestions];
      }

      res.json({
        success: true,
        data: suggestions.map((user) => ({ ...user, isFollowing: false })),
      });
    } catch (error) {
      next(error);
    }
  },

  // Search users for starting direct messages
  searchUsersForMessaging: async (req, res, next) => {
    try {
      const currentUserId = req.user.id;
      const query = (req.query.q || '').trim();
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 8, 1), 20);

      if (query.length < 2) {
        return res.json({
          success: true,
          data: [],
        });
      }

      const users = await prisma.user.findMany({
        where: {
          id: { not: currentUserId },
          isActive: true,
          isVerified: true,
          OR: [
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          photo: true,
          profession: true,
          location: true,
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        take: limit,
      });

      res.json({
        success: true,
        data: users,
      });
    } catch (error) {
      next(error);
    }
  },

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
