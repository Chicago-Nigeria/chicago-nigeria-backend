const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

// Authenticated user profile routes
router.get('/profile', authenticate, userController.getProfile);
router.put('/profile', authenticate, userController.updateProfile);
router.put('/profile/photo', authenticate, upload.single('photo'), userController.updateProfilePhoto);
router.put('/profile/header', authenticate, upload.single('header'), userController.updateHeaderImage);
router.put('/preferences', authenticate, userController.updatePreferences);

// Suggestions (auth required)
router.get('/suggestions', authenticate, userController.getSuggestions);
router.get('/search', authenticate, userController.searchUsersForMessaging);

// Public user profile routes (with optional auth for isFollowing check)
router.get('/:id', optionalAuth, userController.getPublicProfile);
router.get('/:id/posts', optionalAuth, userController.getUserPosts);
router.get('/:id/events', optionalAuth, userController.getUserEvents);
router.get('/:id/listings', optionalAuth, userController.getUserListings);
router.get('/:id/followers', optionalAuth, userController.getFollowers);
router.get('/:id/following', optionalAuth, userController.getFollowing);

// Follow/unfollow routes (auth required)
router.post('/:id/follow', authenticate, userController.followUser);
router.delete('/:id/follow', authenticate, userController.unfollowUser);

module.exports = router;
