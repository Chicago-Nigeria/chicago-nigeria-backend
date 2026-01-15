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
router.put('/listings/:id/flag', adminController.flagListing);
router.delete('/listings/:id', adminController.deleteListing);

// Audit logs
router.get('/audit-logs', adminController.getAuditLogs);

module.exports = router;
