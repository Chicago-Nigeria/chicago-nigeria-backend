const express = require('express');
const router = express.Router();
const listingController = require('../controllers/listing.controller');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

// Public routes (must come before :id routes)
router.get('/', listingController.getAllListings);

// Analytics routes (protected, must come before :id routes)
router.get('/analytics/overview', authenticate, listingController.getAnalyticsOverview);
router.get('/analytics/performance', authenticate, listingController.getAnalyticsPerformance);
router.get('/analytics/stats', listingController.getMarketplaceStats);

// User's own listings (must come before :id routes)
router.get('/user/my-listings', authenticate, listingController.getMyListings);
router.get('/user/my-listings-analytics', authenticate, listingController.getMyListingsWithAnalytics);

// Protected routes for creating/updating
router.post('/', authenticate, upload.array('photos', 8), listingController.createListing);

// Routes with :id parameter
router.get('/:id', optionalAuth, listingController.getListingById);
router.get('/:id/related', listingController.getRelatedListings);
router.get('/:id/comments', listingController.getComments);
router.get('/:id/interaction', optionalAuth, listingController.checkUserInteraction);

router.put('/:id', authenticate, upload.array('photos', 8), listingController.updateListing);
router.delete('/:id', authenticate, listingController.deleteListing);
router.put('/:id/sold', authenticate, listingController.markAsSold);

// Interactions
router.post('/:id/like', authenticate, listingController.toggleLike);
router.post('/:id/save', authenticate, listingController.toggleSave);
router.post('/:id/comments', authenticate, listingController.addComment);

module.exports = router;
