const prisma = require('../config/prisma');
const { uploadToCloudinary, uploadVideoToCloudinary } = require('../utils/cloudinary');

const postController = {
  // Get all posts with pagination (cursor-based for infinite scroll)
  getAllPosts: async (req, res, next) => {
    try {
      const { page = 1, limit = 20, cursor, type } = req.query;
      const userId = req.user?.id;

      const whereClause = cursor
        ? { createdAt: { lt: new Date(cursor) } }
        : {};

      // Filter by type if specified
      if (type) {
        whereClause.type = type;
      }

      const posts = await prisma.post.findMany({
        where: whereClause,
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              photo: true,
              profession: true,
              location: true,
              role: true,
            },
          },
          _count: {
            select: {
              likes: true,
              comments: true,
              saves: true,
            },
          },
          ...(userId && {
            likes: {
              where: { userId },
              select: { id: true },
            },
            saves: {
              where: { userId },
              select: { id: true },
            },
          }),
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit) + 1,
      });

      const hasMore = posts.length > parseInt(limit);
      const postsToReturn = hasMore ? posts.slice(0, -1) : posts;

      // Get unique author IDs and check which ones the current user follows
      let followingAuthorIds = [];
      if (userId) {
        const uniqueAuthorIds = [...new Set(postsToReturn.map(p => p.author.id))];
        const following = await prisma.follow.findMany({
          where: {
            followerId: userId,
            followingId: { in: uniqueAuthorIds },
          },
          select: { followingId: true },
        });
        followingAuthorIds = following.map(f => f.followingId);
      }

      const transformedPosts = postsToReturn.map(post => ({
        ...post,
        author: {
          ...post.author,
          isFollowing: followingAuthorIds.includes(post.author.id),
        },
        isLiked: userId ? post.likes?.length > 0 : false,
        isSaved: userId ? post.saves?.length > 0 : false,
        likes: undefined,
        saves: undefined,
      }));

      // Count without cursor (cursor is for pagination, not filtering)
      const countWhere = type ? { type } : {};
      const total = await prisma.post.count({ where: countWhere });

      res.json({
        success: true,
        data: transformedPosts,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          hasMore,
          nextCursor: hasMore ? postsToReturn[postsToReturn.length - 1].createdAt.toISOString() : null,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Get blog posts only (posts with type="blog" from admin users)
  getBlogPosts: async (req, res, next) => {
    try {
      const { page = 1, limit = 20, cursor } = req.query;
      const userId = req.user?.id;

      const whereClause = {
        type: 'blog',
        author: {
          role: { in: ['admin', 'super_admin'] },
        },
      };

      if (cursor) {
        whereClause.createdAt = { lt: new Date(cursor) };
      }

      const posts = await prisma.post.findMany({
        where: whereClause,
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              photo: true,
              profession: true,
              location: true,
              role: true,
            },
          },
          _count: {
            select: {
              likes: true,
              comments: true,
              saves: true,
            },
          },
          ...(userId && {
            likes: {
              where: { userId },
              select: { id: true },
            },
            saves: {
              where: { userId },
              select: { id: true },
            },
          }),
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit) + 1,
      });

      const hasMore = posts.length > parseInt(limit);
      const postsToReturn = hasMore ? posts.slice(0, -1) : posts;

      // Get unique author IDs and check which ones the current user follows
      let followingAuthorIds = [];
      if (userId) {
        const uniqueAuthorIds = [...new Set(postsToReturn.map(p => p.author.id))];
        const following = await prisma.follow.findMany({
          where: {
            followerId: userId,
            followingId: { in: uniqueAuthorIds },
          },
          select: { followingId: true },
        });
        followingAuthorIds = following.map(f => f.followingId);
      }

      const transformedPosts = postsToReturn.map(post => ({
        ...post,
        author: {
          ...post.author,
          isFollowing: followingAuthorIds.includes(post.author.id),
        },
        isLiked: userId ? post.likes?.length > 0 : false,
        isSaved: userId ? post.saves?.length > 0 : false,
        likes: undefined,
        saves: undefined,
      }));

      const total = await prisma.post.count({ where: whereClause });

      res.json({
        success: true,
        data: transformedPosts,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          hasMore,
          nextCursor: hasMore ? postsToReturn[postsToReturn.length - 1].createdAt.toISOString() : null,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Get posts from users the current user follows
  getFollowingPosts: async (req, res, next) => {
    try {
      const { page = 1, limit = 20, cursor } = req.query;
      const userId = req.user.id;

      // Get IDs of users the current user follows
      const following = await prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      });

      const followingIds = following.map((f) => f.followingId);

      if (followingIds.length === 0) {
        return res.json({
          success: true,
          data: [],
          meta: {
            total: 0,
            page: parseInt(page),
            limit: parseInt(limit),
            hasMore: false,
            nextCursor: null,
          },
        });
      }

      const whereClause = {
        authorId: { in: followingIds },
      };

      if (cursor) {
        whereClause.createdAt = { lt: new Date(cursor) };
      }

      const posts = await prisma.post.findMany({
        where: whereClause,
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              photo: true,
              profession: true,
              location: true,
              role: true,
            },
          },
          _count: {
            select: {
              likes: true,
              comments: true,
              saves: true,
            },
          },
          likes: {
            where: { userId },
            select: { id: true },
          },
          saves: {
            where: { userId },
            select: { id: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit) + 1,
      });

      const hasMore = posts.length > parseInt(limit);
      const postsToReturn = hasMore ? posts.slice(0, -1) : posts;

      // All posts in this feed are from users the current user follows
      const transformedPosts = postsToReturn.map((post) => ({
        ...post,
        author: {
          ...post.author,
          isFollowing: true, // Always true since these are posts from followed users
        },
        isLiked: post.likes?.length > 0,
        isSaved: post.saves?.length > 0,
        likes: undefined,
        saves: undefined,
      }));

      const total = await prisma.post.count({
        where: { authorId: { in: followingIds } },
      });

      res.json({
        success: true,
        data: transformedPosts,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          hasMore,
          nextCursor: hasMore ? postsToReturn[postsToReturn.length - 1].createdAt.toISOString() : null,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Get single post by ID
  getPostById: async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const post = await prisma.post.findUnique({
        where: { id },
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              photo: true,
              profession: true,
              location: true,
              bio: true,
            },
          },
          comments: {
            include: {
              author: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  photo: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
          _count: {
            select: {
              likes: true,
              comments: true,
              saves: true,
            },
          },
          ...(userId && {
            likes: {
              where: { userId },
              select: { id: true },
            },
            saves: {
              where: { userId },
              select: { id: true },
            },
          }),
        },
      });

      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post not found',
        });
      }

      // Check if current user follows the post author
      let isFollowingAuthor = false;
      if (userId && userId !== post.author.id) {
        const follow = await prisma.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: userId,
              followingId: post.author.id,
            },
          },
        });
        isFollowingAuthor = !!follow;
      }

      res.json({
        success: true,
        data: {
          ...post,
          author: {
            ...post.author,
            isFollowing: isFollowingAuthor,
          },
          isLiked: userId ? post.likes?.length > 0 : false,
          isSaved: userId ? post.saves?.length > 0 : false,
          likes: undefined,
          saves: undefined,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Create new post with media uploads
  createPost: async (req, res, next) => {
    try {
      const { content, type = 'post' } = req.body;
      const userId = req.user.id;

      const imageUrls = [];
      const videoUrls = [];

      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          if (file.mediaType === 'video' || file.mimetype.startsWith('video/')) {
            const url = await uploadVideoToCloudinary(file.buffer, 'post', userId);
            videoUrls.push(url);
          } else {
            const url = await uploadToCloudinary(file.buffer, 'post', userId);
            imageUrls.push(url);
          }
        }
      }

      const post = await prisma.post.create({
        data: {
          content: content || '',
          type,
          images: imageUrls,
          videos: videoUrls,
          authorId: userId,
        },
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
        },
      });

      res.status(201).json({
        success: true,
        message: 'Post created successfully',
        data: {
          ...post,
          isLiked: false,
          isSaved: false,
        },
      });
    } catch (error) {
      console.error('Create post error:', error);
      next(error);
    }
  },

  // Update post (only within 1 hour of creation)
  updatePost: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { content } = req.body;
      const userId = req.user.id;

      const post = await prisma.post.findUnique({
        where: { id },
      });

      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post not found',
        });
      }

      if (post.authorId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to update this post',
        });
      }

      // Check if post is within 1-hour edit window
      const oneHourInMs = 60 * 60 * 1000;
      const postAge = Date.now() - new Date(post.createdAt).getTime();

      if (postAge > oneHourInMs) {
        return res.status(403).json({
          success: false,
          message: 'Posts can only be edited within 1 hour of creation',
        });
      }

      const updated = await prisma.post.update({
        where: { id },
        data: { content },
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
        },
      });

      res.json({
        success: true,
        message: 'Post updated',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  },

  // Delete post
  deletePost: async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const post = await prisma.post.findUnique({
        where: { id },
      });

      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post not found',
        });
      }

      if (post.authorId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to delete this post',
        });
      }

      await prisma.post.delete({
        where: { id },
      });

      res.json({
        success: true,
        message: 'Post deleted',
      });
    } catch (error) {
      next(error);
    }
  },

  // Toggle like on post
  toggleLike: async (req, res, next) => {
    try {
      const { id: postId } = req.params;
      const userId = req.user.id;

      // Check if post exists
      const post = await prisma.post.findUnique({
        where: { id: postId },
      });

      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post not found',
        });
      }

      const existing = await prisma.like.findUnique({
        where: {
          userId_postId: {
            userId,
            postId,
          },
        },
      });

      if (existing) {
        await prisma.like.delete({
          where: { id: existing.id },
        });

        const likeCount = await prisma.like.count({
          where: { postId },
        });

        res.json({
          success: true,
          message: 'Unliked',
          liked: false,
          likeCount,
        });
      } else {
        await prisma.like.create({
          data: {
            userId,
            postId,
          },
        });

        const likeCount = await prisma.like.count({
          where: { postId },
        });

        res.json({
          success: true,
          message: 'Liked',
          liked: true,
          likeCount,
        });
      }
    } catch (error) {
      next(error);
    }
  },

  // Toggle save on post
  toggleSave: async (req, res, next) => {
    try {
      const { id: postId } = req.params;
      const userId = req.user.id;

      // Check if post exists
      const post = await prisma.post.findUnique({
        where: { id: postId },
      });

      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post not found',
        });
      }

      const existing = await prisma.save.findUnique({
        where: {
          userId_postId: {
            userId,
            postId,
          },
        },
      });

      if (existing) {
        await prisma.save.delete({
          where: { id: existing.id },
        });

        res.json({
          success: true,
          message: 'Unsaved',
          saved: false,
        });
      } else {
        await prisma.save.create({
          data: {
            userId,
            postId,
          },
        });

        res.json({
          success: true,
          message: 'Saved',
          saved: true,
        });
      }
    } catch (error) {
      next(error);
    }
  },

  // Add comment to post
  addComment: async (req, res, next) => {
    try {
      const { id: postId } = req.params;
      const { content } = req.body;
      const userId = req.user.id;

      if (!content || content.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Comment content is required',
        });
      }

      const post = await prisma.post.findUnique({
        where: { id: postId },
      });

      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post not found',
        });
      }

      const comment = await prisma.comment.create({
        data: {
          content: content.trim(),
          authorId: userId,
          postId,
        },
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              photo: true,
            },
          },
        },
      });

      const commentCount = await prisma.comment.count({
        where: { postId },
      });

      res.status(201).json({
        success: true,
        message: 'Comment added',
        data: comment,
        commentCount,
      });
    } catch (error) {
      next(error);
    }
  },

  // Get comments for a post
  getComments: async (req, res, next) => {
    try {
      const { id: postId } = req.params;
      const { page = 1, limit = 20 } = req.query;

      const comments = await prisma.comment.findMany({
        where: { postId },
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              photo: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      });

      const total = await prisma.comment.count({
        where: { postId },
      });

      res.json({
        success: true,
        data: comments,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Delete comment
  deleteComment: async (req, res, next) => {
    try {
      const { id: postId, commentId } = req.params;
      const userId = req.user.id;

      const comment = await prisma.comment.findUnique({
        where: { id: commentId },
      });

      if (!comment) {
        return res.status(404).json({
          success: false,
          message: 'Comment not found',
        });
      }

      if (comment.authorId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to delete this comment',
        });
      }

      await prisma.comment.delete({
        where: { id: commentId },
      });

      const commentCount = await prisma.comment.count({
        where: { postId },
      });

      res.json({
        success: true,
        message: 'Comment deleted',
        commentCount,
      });
    } catch (error) {
      next(error);
    }
  },

  // Get post count (for "new posts available" feature)
  getPostCount: async (req, res, next) => {
    try {
      const { since } = req.query;

      const whereClause = since
        ? { createdAt: { gt: new Date(since) } }
        : {};

      const count = await prisma.post.count({
        where: whereClause,
      });

      res.json({
        success: true,
        data: { count },
      });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = postController;
