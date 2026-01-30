const express = require('express');
const router = express.Router();
const feedController = require('../controllers/feed.controller');
const { optionalAuth } = require('../middleware/auth');

// Get active promoted content for feed
router.get('/promoted', optionalAuth, feedController.getActivePromotedContent);

// Track impression when promoted content is viewed
router.post('/promoted/:id/impression', optionalAuth, feedController.recordImpression);

// Track click when user interacts with promoted content
router.post('/promoted/:id/click', optionalAuth, feedController.recordClick);

// Get community stats for the feed sidebar
router.get('/stats', feedController.getCommunityStats);

module.exports = router;
