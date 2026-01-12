const express = require('express');
const router = express.Router();
const listingController = require('../controllers/listing.controller');
const { authenticate } = require('../middleware/auth');

router.get('/', listingController.getAllListings);
router.get('/:id', listingController.getListingById);
router.post('/', authenticate, listingController.createListing);
router.put('/:id', authenticate, listingController.updateListing);
router.delete('/:id', authenticate, listingController.deleteListing);
router.post('/:id/like', authenticate, listingController.toggleLike);
router.post('/:id/save', authenticate, listingController.toggleSave);

module.exports = router;
