const express = require('express');
const router = express.Router();
const postController = require('../controllers/post.controller');
const { authenticate } = require('../middleware/auth');

router.get('/', postController.getAllPosts);
router.get('/:id', postController.getPostById);
router.post('/', authenticate, postController.createPost);
router.put('/:id', authenticate, postController.updatePost);
router.delete('/:id', authenticate, postController.deletePost);
router.post('/:id/like', authenticate, postController.toggleLike);
router.post('/:id/comment', authenticate, postController.addComment);

module.exports = router;
