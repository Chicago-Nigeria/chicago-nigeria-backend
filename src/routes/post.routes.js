const express = require('express');
const router = express.Router();
const postController = require('../controllers/post.controller');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { uploadMedia } = require('../middleware/upload');

// Public routes (with optional auth for personalized data)
router.get('/', optionalAuth, postController.getAllPosts);
router.get('/blog', optionalAuth, postController.getBlogPosts);
router.get('/following', authenticate, postController.getFollowingPosts);
router.get('/count', postController.getPostCount);
router.get('/:id', optionalAuth, postController.getPostById);
router.get('/:id/comments', postController.getComments);

// Protected routes
router.post('/', authenticate, uploadMedia.array('media', 10), postController.createPost);
router.put('/:id', authenticate, postController.updatePost);
router.delete('/:id', authenticate, postController.deletePost);
router.post('/:id/like', authenticate, postController.toggleLike);
router.post('/:id/save', authenticate, postController.toggleSave);
router.post('/:id/comment', authenticate, postController.addComment);
router.delete('/:id/comments/:commentId', authenticate, postController.deleteComment);

module.exports = router;
