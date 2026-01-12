const prisma = require('../config/prisma');

const postController = {
  getAllPosts: async (req, res, next) => {
    try {
      const posts = await prisma.post.findMany({
        include: {
          author: {
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
              comments: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.json({
        success: true,
        data: posts,
      });
    } catch (error) {
      next(error);
    }
  },

  getPostById: async (req, res, next) => {
    res.json({ success: true, message: 'Get post - TODO' });
  },

  createPost: async (req, res, next) => {
    res.json({ success: true, message: 'Create post - TODO' });
  },

  updatePost: async (req, res, next) => {
    res.json({ success: true, message: 'Update post - TODO' });
  },

  deletePost: async (req, res, next) => {
    res.json({ success: true, message: 'Delete post - TODO' });
  },

  toggleLike: async (req, res, next) => {
    res.json({ success: true, message: 'Toggle like - TODO' });
  },

  addComment: async (req, res, next) => {
    res.json({ success: true, message: 'Add comment - TODO' });
  },
};

module.exports = postController;
