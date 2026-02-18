const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscription.controller');
const { authenticate, authenticateAdmin } = require('../middleware/auth');

// User routes
router.post('/create-session', authenticate, subscriptionController.createSubscriptionSession);
router.post('/verify', authenticate, subscriptionController.verifySubscription);
router.get('/my-subscription', authenticate, subscriptionController.getMySubscription);
router.post('/cancel', authenticate, subscriptionController.cancelSubscription);
router.post('/renew', authenticate, subscriptionController.renewSubscription);

// Admin routes
router.get('/admin/all', authenticate, authenticateAdmin, subscriptionController.getAllSubscriptions);
router.post('/admin/:subscriptionId/cancel', authenticate, authenticateAdmin, subscriptionController.adminCancelSubscription);
router.post('/admin/:subscriptionId/reactivate', authenticate, authenticateAdmin, subscriptionController.adminReactivateSubscription);

module.exports = router;
