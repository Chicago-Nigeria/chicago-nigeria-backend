const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { authenticateAdmin } = require('../middleware/auth');
const { adminAuthLimiter, adminApiLimiter } = require('../middleware/rateLimiter');
const { upload } = require('../middleware/upload');

// ==================== ADMIN AUTHENTICATION ====================
// Public routes (but rate limited)
router.post('/auth/send-otp', adminAuthLimiter, adminController.sendAdminSigninOTP);
router.post('/auth/verify-otp', adminAuthLimiter, adminController.verifyAdminSigninOTP);
router.get('/auth/session', authenticateAdmin, adminController.getAdminSession);
router.post('/auth/logout', authenticateAdmin, adminController.adminLogout);

// ==================== PROTECTED ADMIN ROUTES ====================
// Apply rate limiter and authentication to all routes below
router.use(adminApiLimiter);
router.use(authenticateAdmin);

// Dashboard
router.get('/dashboard/stats', adminController.getDashboardStats);
router.get('/dashboard/recent-activities', adminController.getRecentUserActivities);

// User management
router.get('/users/search', adminController.searchUserByEmail); // Search by email (for organizer assignment)
router.get('/users', adminController.getAllUsers);
router.get('/users/:id', adminController.getUserById);
router.put('/users/:id/ban', adminController.banUser);
router.put('/users/:id/unban', adminController.unbanUser);
router.delete('/users/:id', adminController.deleteUser);

// Event management
router.get('/events', adminController.getAllEvents);
router.get('/events/service-fees/total', adminController.getEventServiceFees);
router.post('/events', upload.single('coverImage'), adminController.createEvent);
router.get('/events/:id', adminController.getEventById);
router.put('/events/:id/approve', adminController.approveEvent);
router.put('/events/:id/reject', adminController.rejectEvent);
router.delete('/events/:id', adminController.deleteEvent);

// Marketplace management
router.get('/listings', adminController.getAllListings);
router.get('/listings/:id', adminController.getListingById);
router.put('/listings/:id/approve', adminController.approveListing);
router.put('/listings/:id/reject', adminController.rejectListing);
router.put('/listings/:id/flag', adminController.flagListing);
router.delete('/listings/:id', adminController.deleteListing);

// Payout management
router.get('/payouts', adminController.getAllPayouts);
router.get('/payouts/stats', adminController.getPayoutStats);
router.get('/payouts/detailed', adminController.getPayoutsDetailed);
router.get('/payouts/manual/pending', adminController.getPendingManualPayouts);
router.post('/payouts/process-stripe', adminController.processStripePayout);
router.post('/payouts/process-event/:eventId', adminController.processEventPayout);
router.put('/payouts/:id/mark-paid', adminController.markPayoutAsPaid);
router.put('/payouts/:id/retry', adminController.retryPayout);
router.put('/payouts/migrate/:userId', adminController.migrateManualToStripe);

// Audit logs
router.get('/audit-logs', adminController.getAuditLogs);

// Blog post management
router.get('/posts', adminController.getAdminPosts);
router.post('/posts', upload.array('media', 10), adminController.createBlogPost);
router.put('/posts/:id', adminController.updateBlogPost);
router.delete('/posts/:id', adminController.deleteBlogPost);

// Promoted content management
router.get('/promoted-content', adminController.getPromotedContent);
router.post('/promoted-content', adminController.createPromotedContent);
router.put('/promoted-content/:id', adminController.updatePromotedContent);
router.delete('/promoted-content/:id', adminController.deletePromotedContent);
router.put('/promoted-content/:id/toggle', adminController.togglePromotedContent);

module.exports = router;
