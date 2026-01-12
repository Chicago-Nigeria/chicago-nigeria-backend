const prisma = require('../config/prisma');
const jwt = require('jsonwebtoken');
const { sendOTPEmail } = require('../utils/email');
const { generateOTP } = require('../utils/otp');

const authController = {
  // Send OTP for signup
  sendSignupOTP: async (req, res, next) => {
    try {
      const { email, phone } = req.body;

      // Check if user already exists
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [{ email }, { phone }],
        },
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'User with this email or phone already exists',
        });
      }

      // Generate OTP
      const otp = generateOTP();
      const expiresAt = new Date(Date.now() + parseInt(process.env.OTP_EXPIRY_MINUTES || 10) * 60 * 1000);

      // Delete any existing OTPs for this email
      await prisma.oTPCode.deleteMany({
        where: { email, type: 'signup' },
      });

      // Create new OTP
      await prisma.oTPCode.create({
        data: {
          email,
          phone,
          otp,
          type: 'signup',
          expiresAt,
        },
      });

      // Send OTP via email
      await sendOTPEmail(email, otp, { isSignup: true });

      res.json({
        success: true,
        message: 'OTP sent to your email',
      });
    } catch (error) {
      next(error);
    }
  },

  // Signup with OTP verification
  signupSimple: async (req, res, next) => {
    try {
      const { firstName, lastName, phone, email, countryCode, otp } = req.body;

      // Verify OTP
      const otpRecord = await prisma.oTPCode.findFirst({
        where: {
          email,
          otp,
          type: 'signup',
          used: false,
          expiresAt: { gte: new Date() },
        },
      });

      if (!otpRecord) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired OTP',
        });
      }

      // Create user
      const user = await prisma.user.create({
        data: {
          firstName,
          lastName,
          email,
          phone,
          countryCode,
          isVerified: true,
          preferences: {
            create: {},
          },
        },
      });

      // Mark OTP as used
      await prisma.oTPCode.update({
        where: { id: otpRecord.id },
        data: { used: true },
      });

      // Generate tokens
      const accessToken = jwt.sign(
        { userId: user.id },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: process.env.JWT_ACCESS_EXPIRY || '7d' } // Changed from 15m to 7d
      );

      const refreshToken = jwt.sign(
        { userId: user.id },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRY || '30d' } // Changed from 7d to 30d
      );

      // Store refresh token
      await prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Changed from 7d to 30d
        },
      });

      // Set cookies
      res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // Changed from 15m to 7 days
      });

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000, // Changed from 7d to 30 days
      });

      res.json({
        success: true,
        message: 'Account created successfully',
        data: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          photo: user.photo,
          bio: user.bio,
          location: user.location,
          profession: user.profession,
          company: user.company,
          isVerified: user.isVerified,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Send OTP for signin
  sendSigninOTP: async (req, res, next) => {
    try {
      const { email } = req.body;

      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'No account found with this email',
        });
      }

      // Generate OTP
      const otp = generateOTP();
      const expiresAt = new Date(Date.now() + parseInt(process.env.OTP_EXPIRY_MINUTES || 10) * 60 * 1000);

      // Delete any existing signin OTPs for this email
      await prisma.oTPCode.deleteMany({
        where: { email, type: 'signin' },
      });

      // Create new OTP
      await prisma.oTPCode.create({
        data: {
          email,
          otp,
          type: 'signin',
          expiresAt,
          userId: user.id,
        },
      });

      // Send OTP via email
      await sendOTPEmail(email, otp, {
        firstName: user.firstName,
        isSignup: false
      });

      res.json({
        success: true,
        message: 'OTP sent to your email',
      });
    } catch (error) {
      next(error);
    }
  },

  // Signin with OTP
  signinWithOTP: async (req, res, next) => {
    try {
      const { email, otp } = req.body;

      // Verify OTP
      const otpRecord = await prisma.oTPCode.findFirst({
        where: {
          email,
          otp,
          type: 'signin',
          used: false,
          expiresAt: { gte: new Date() },
        },
      });

      if (!otpRecord) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired OTP',
        });
      }

      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      // Mark OTP as used
      await prisma.oTPCode.update({
        where: { id: otpRecord.id },
        data: { used: true },
      });

      // Generate tokens
      const accessToken = jwt.sign(
        { userId: user.id },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: process.env.JWT_ACCESS_EXPIRY || '7d' } // Changed from 15m to 7d
      );

      const refreshToken = jwt.sign(
        { userId: user.id },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRY || '30d' } // Changed from 7d to 30d
      );

      // Store refresh token
      await prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Changed from 7d to 30d
        },
      });

      // Set cookies
      res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // Changed from 15m to 7 days
      });

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000, // Changed from 7d to 30 days
      });

      res.json({
        success: true,
        message: 'Signed in successfully',
        data: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          photo: user.photo,
          bio: user.bio,
          location: user.location,
          profession: user.profession,
          company: user.company,
          isVerified: user.isVerified,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Get current session
  getSession: async (req, res) => {
    res.json({
      success: true,
      data: req.user,
    });
  },

  // Logout
  logout: async (req, res, next) => {
    try {
      const refreshToken = req.cookies.refreshToken;

      if (refreshToken) {
        await prisma.refreshToken.deleteMany({
          where: { token: refreshToken },
        });
      }

      res.clearCookie('accessToken');
      res.clearCookie('refreshToken');

      res.json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  // Refresh token
  refreshToken: async (req, res, next) => {
    try {
      const { refreshToken } = req.cookies;

      if (!refreshToken) {
        return res.status(401).json({
          success: false,
          message: 'No refresh token provided',
        });
      }

      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

      const tokenRecord = await prisma.refreshToken.findUnique({
        where: { token: refreshToken },
      });

      if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired refresh token',
        });
      }

      const newAccessToken = jwt.sign(
        { userId: decoded.userId },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: process.env.JWT_ACCESS_EXPIRY || '7d' } // Changed from 15m to 7d
      );

      res.cookie('accessToken', newAccessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // Changed from 15m to 7 days
      });

      res.json({
        success: true,
        message: 'Token refreshed',
      });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = authController;
