const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const extractToken = (req, options = {}) => {
  const { allowQueryToken = false } = options;

  // Check cookie first
  let token = req.cookies.accessToken;

  // Fallback to Authorization header
  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  // SSE/EventSource cannot set Authorization headers; allow query token for that route only
  if (!token && allowQueryToken && typeof req.query?.accessToken === 'string') {
    token = req.query.accessToken;
  }

  return token;
};

const authenticate = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        photo: true,
        headerImage: true,
        bio: true,
        location: true,
        profession: true,
        company: true,
        isVerified: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication',
      });
    }

    if (!user.isVerified) {
      return res.status(423).json({
        success: false,
        message: 'Please verify your email',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired',
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
    });
  }
};

// Optional authentication - sets req.user if valid token, otherwise null
const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        photo: true,
        headerImage: true,
        bio: true,
        location: true,
        profession: true,
        company: true,
        isVerified: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive || !user.isVerified) {
      req.user = null;
      return next();
    }

    req.user = user;
    next();
  } catch (error) {
    // Token invalid or expired - continue without user
    req.user = null;
    next();
  }
};

const authenticateAdmin = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication',
      });
    }

    // Check if user has admin privileges
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
    }

    req.user = user;
    req.isAdmin = true;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired',
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
    });
  }
};

const authenticateSSE = async (req, res, next) => {
  try {
    const token = extractToken(req, { allowQueryToken: true });

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        photo: true,
        headerImage: true,
        bio: true,
        location: true,
        profession: true,
        company: true,
        isVerified: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication',
      });
    }

    if (!user.isVerified) {
      return res.status(423).json({
        success: false,
        message: 'Please verify your email',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired',
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
    });
  }
};

module.exports = { authenticate, optionalAuth, authenticateAdmin, authenticateSSE };
