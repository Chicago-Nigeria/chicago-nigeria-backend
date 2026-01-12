const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');

// OTP-based authentication routes
router.post('/send-otp', authController.sendSignupOTP);
router.post('/signup-simple', authController.signupSimple);

router.post('/send-signin-otp', authController.sendSigninOTP);
router.post('/signin-with-otp', authController.signinWithOTP);

// Session management
router.get('/session', authenticate, authController.getSession);
router.post('/logout', authenticate, authController.logout);
router.post('/refresh-token', authController.refreshToken);

module.exports = router;
