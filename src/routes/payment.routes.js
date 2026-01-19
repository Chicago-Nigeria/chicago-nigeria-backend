const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { authenticate } = require('../middleware/auth');

// ==================== ORGANIZER STRIPE CONNECT ====================

// Create connected Stripe account (for organizers)
router.post('/connect/create', authenticate, paymentController.createConnectAccount);

// Get account status
router.get('/connect/status', authenticate, paymentController.getAccountStatus);

// Refresh onboarding link
router.post('/connect/refresh-link', authenticate, paymentController.refreshOnboardingLink);

// Get Stripe dashboard link
router.get('/connect/dashboard', authenticate, paymentController.createDashboardLink);

// ==================== TICKET PURCHASE ====================

// Create payment intent for ticket purchase
router.post('/create-payment-intent', authenticate, paymentController.createPaymentIntent);

// Confirm payment and create tickets
router.post('/confirm', authenticate, paymentController.confirmPayment);

// Calculate price breakdown
router.get('/calculate', paymentController.calculatePrice);

// ==================== EARNINGS & PAYOUTS ====================

// Get organizer earnings summary
router.get('/earnings', authenticate, paymentController.getEarningsSummary);

// Process pending payouts (admin only - should be called by cron job)
router.post('/process-payouts', authenticate, paymentController.processPendingPayouts);

// ==================== REFUNDS ====================

// Request refund for a ticket
router.post('/refund/:ticketId', authenticate, paymentController.requestRefund);

module.exports = router;
