const prisma = require('../config/prisma');
const jwt = require('jsonwebtoken');
const { sendOTPEmail } = require('../utils/email');
const { generateOTP } = require('../utils/otp');
const { uploadToCloudinary } = require('../utils/cloudinary');

// Helper function to log admin actions
const logAdminAction = async (adminId, action, targetType, targetId, details, req) => {
  try {
    await prisma.adminAuditLog.create({
      data: {
        adminId,
        action,
        targetType,
        targetId,
        details: details || {},
        ipAddress: req.ip || req.connection?.remoteAddress,
      },
    });
  } catch (error) {
    console.error('Error logging admin action:', error);
  }
};

const adminController = {
  // ==================== ADMIN AUTHENTICATION ====================

  // Send admin signin OTP
  sendAdminSigninOTP: async (req, res, next) => {
    try {
      const { email } = req.body;

      // Find user
      const user = await prisma.user.findUnique({
        where: { email },
      });

      // Don't reveal if user exists (security)
      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Invalid credentials',
        });
      }

      // Check if user is admin
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied',
        });
      }

      // Generate OTP
      const otp = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Delete existing admin signin OTPs
      await prisma.oTPCode.deleteMany({
        where: { email, type: 'admin-signin' },
      });

      // Create new OTP
      await prisma.oTPCode.create({
        data: {
          email,
          otp,
          type: 'admin-signin',
          expiresAt,
          userId: user.id,
        },
      });

      // Send OTP via email
      await sendOTPEmail(email, otp, {
        firstName: user.firstName,
        isSignup: false,
        isAdmin: true,
      });

      res.json({
        success: true,
        message: 'OTP sent to your email',
      });
    } catch (error) {
      next(error);
    }
  },

  // Verify admin OTP and sign in
  verifyAdminSigninOTP: async (req, res, next) => {
    try {
      const { email, otp } = req.body;

      // Verify OTP
      const otpRecord = await prisma.oTPCode.findFirst({
        where: {
          email,
          otp,
          type: 'admin-signin',
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

      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({
          success: false,
          message: 'Access denied',
        });
      }

      // Mark OTP as used
      await prisma.oTPCode.update({
        where: { id: otpRecord.id },
        data: { used: true },
      });

      // Generate tokens with longer expiry for admin sessions
      const accessToken = jwt.sign(
        { userId: user.id },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: '2h' } // 2 hours for admin sessions
      );

      const refreshToken = jwt.sign(
        { userId: user.id },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: '7d' }
      );

      await prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      // Log admin signin
      await logAdminAction(
        user.id,
        'admin_signin',
        'auth',
        user.id,
        { timestamp: new Date() },
        req
      );

      // Set cookies with longer expiry
      res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 2 * 60 * 60 * 1000, // 2 hours
      });

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.json({
        success: true,
        message: 'Admin signed in successfully',
        data: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Get admin session
  getAdminSession: async (req, res) => {
    res.json({
      success: true,
      data: {
        ...req.user,
        isAdmin: true,
      },
    });
  },

  // Admin logout
  adminLogout: async (req, res, next) => {
    try {
      const refreshToken = req.cookies.refreshToken;

      // Delete refresh token from database if exists
      if (refreshToken) {
        await prisma.refreshToken.deleteMany({
          where: { token: refreshToken },
        });
      }

      // Log admin logout
      if (req.user?.id) {
        await logAdminAction(
          req.user.id,
          'admin_logout',
          'auth',
          req.user.id,
          { timestamp: new Date() },
          req
        );
      }

      // Clear cookies
      res.clearCookie('accessToken');
      res.clearCookie('refreshToken');

      res.json({
        success: true,
        message: 'Admin logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  // ==================== DASHBOARD ====================

  getDashboardStats: async (req, res, next) => {
    try {
      const [
        totalUsers,
        activeUsers,
        paidUsers,
        totalEvents,
        upcomingEvents,
        pendingEvents,
        totalListings,
        pendingListings,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { isActive: true } }),
        prisma.user.count({ where: { role: 'paid' } }),
        prisma.event.count(),
        prisma.event.count({ where: { status: 'upcoming' } }),
        prisma.event.count({ where: { status: 'pending' } }),
        prisma.listing.count(),
        prisma.listing.count({ where: { status: 'pending' } }),
      ]);

      // Calculate revenue from service fees ($5 per ticket sold)
      const ticketCount = await prisma.ticket.count({
        where: {
          status: 'confirmed',
          event: {
            isFree: false,
          },
        },
      });

      const revenue = ticketCount * 5; // $5 service fee per ticket

      // Get user growth data (last 7 months)
      const now = new Date();
      const userGrowth = [];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      for (let i = 6; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const nextDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

        const count = await prisma.user.count({
          where: {
            createdAt: {
              gte: date,
              lt: nextDate,
            },
          },
        });

        userGrowth.push({
          month: months[date.getMonth()],
          users: count,
        });
      }

      // Calculate cumulative user growth
      let cumulative = 0;
      const cumulativeUserGrowth = userGrowth.map(item => {
        cumulative += item.users;
        return {
          month: item.month,
          users: cumulative,
        };
      });

      // Get user types breakdown
      const freeUsers = await prisma.user.count({ where: { role: 'user' } });
      const advertisers = await prisma.user.count({ where: { role: 'advertiser' } });

      const userTypes = [
        { name: 'Free', value: freeUsers, color: '#9CA3AF' },
        { name: 'Paid', value: paidUsers, color: '#068E52' },
        { name: 'Advertiser', value: advertisers, color: '#F97316' },
      ];

      // Calculate revenue by source
      const eventServiceFeeRevenue = ticketCount * 5; // $5 per ticket

      const revenueBySource = [
        { source: 'Event Service Fees', amount: eventServiceFeeRevenue },
        { source: 'Subscriptions', amount: 0 }, // Placeholder for future subscription system
        { source: 'Marketplace', amount: 0 }, // Placeholder for future marketplace fees
        { source: 'Ads', amount: 0 }, // Placeholder for future ad revenue
      ];

      res.json({
        success: true,
        data: {
          users: {
            total: totalUsers,
            active: activeUsers,
            paid: paidUsers || 0,
          },
          events: {
            total: totalEvents,
            upcoming: upcomingEvents,
            pending: pendingEvents || 0,
          },
          listings: {
            total: totalListings,
            pending: pendingListings || 0,
          },
          revenue,
          userGrowth: cumulativeUserGrowth,
          userTypes,
          revenueBySource,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  getRecentUserActivities: async (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit) || 10;

      // Fetch recent user registrations
      const recentUsers = await prisma.user.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          createdAt: true,
        },
      });

      // Fetch recent event submissions
      const recentEvents = await prisma.event.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          organizer: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      // Fetch recent listing submissions
      const recentListings = await prisma.listing.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          status: true,
          price: true,
          createdAt: true,
          seller: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      // Fetch recent ticket purchases
      const recentTickets = await prisma.ticket.findMany({
        take: limit,
        orderBy: { purchasedAt: 'desc' },
        where: {
          status: 'confirmed',
        },
        select: {
          id: true,
          totalPrice: true,
          quantity: true,
          purchasedAt: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          event: {
            select: {
              title: true,
            },
          },
        },
      });

      // Combine all activities and sort by date
      const activities = [
        ...recentUsers.map((user) => ({
          type: 'user_registration',
          title: `${user.firstName} ${user.lastName}`,
          subtitle: 'New user registration',
          timestamp: user.createdAt,
          id: user.id,
        })),
        ...recentEvents.map((event) => ({
          type: 'event_submission',
          title: event.title,
          subtitle: `Event submitted by ${event.organizer.firstName} ${event.organizer.lastName}`,
          status: event.status,
          timestamp: event.createdAt,
          id: event.id,
        })),
        ...recentListings.map((listing) => ({
          type: 'listing_submission',
          title: listing.title,
          subtitle: `Listed by ${listing.seller.firstName} ${listing.seller.lastName}`,
          status: listing.status,
          price: listing.price,
          timestamp: listing.createdAt,
          id: listing.id,
        })),
        ...recentTickets.map((ticket) => ({
          type: 'ticket_purchase',
          title: ticket.event.title,
          subtitle: `${ticket.user.firstName} ${ticket.user.lastName} purchased ${ticket.quantity} ticket(s)`,
          amount: ticket.totalPrice,
          timestamp: ticket.purchasedAt,
          id: ticket.id,
        })),
      ]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);

      res.json({
        success: true,
        data: activities,
      });
    } catch (error) {
      next(error);
    }
  },

  // ==================== USER MANAGEMENT ====================

  /**
   * Search for a user by email (for organizer assignment)
   */
  searchUserByEmail: async (req, res, next) => {
    try {
      const { email } = req.query;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required',
        });
      }

      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          photo: true,
          stripeAccount: {
            select: {
              chargesEnabled: true,
            },
          },
        },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'No user found with this email address',
        });
      }

      res.json({
        success: true,
        data: {
          ...user,
          hasStripeConnected: user.stripeAccount?.chargesEnabled || false,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  getAllUsers: async (req, res, next) => {
    try {
      const { page = 1, limit = 20, search, role, isActive } = req.query;

      const where = {};

      if (search) {
        where.OR = [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ];
      }

      if (role) {
        where.role = role;
      }

      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }

      const users = await prisma.user.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          photo: true,
          role: true,
          isVerified: true,
          isActive: true,
          createdAt: true,
          _count: {
            select: {
              listings: true,
              events: true,
              posts: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      });

      const total = await prisma.user.count({ where });

      res.json({
        success: true,
        data: users,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  getUserById: async (req, res, next) => {
    try {
      const { id } = req.params;

      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              listings: true,
              events: true,
              posts: true,
              tickets: true,
            },
          },
        },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  },

  banUser: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const user = await prisma.user.update({
        where: { id },
        data: { isActive: false },
      });

      await logAdminAction(
        req.user.id,
        'ban_user',
        'user',
        id,
        { reason },
        req
      );

      res.json({
        success: true,
        message: 'User banned successfully',
        data: user,
      });
    } catch (error) {
      next(error);
    }
  },

  unbanUser: async (req, res, next) => {
    try {
      const { id } = req.params;

      const user = await prisma.user.update({
        where: { id },
        data: { isActive: true },
      });

      await logAdminAction(
        req.user.id,
        'unban_user',
        'user',
        id,
        {},
        req
      );

      res.json({
        success: true,
        message: 'User unbanned successfully',
        data: user,
      });
    } catch (error) {
      next(error);
    }
  },

  deleteUser: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      await logAdminAction(
        req.user.id,
        'delete_user',
        'user',
        id,
        { reason },
        req
      );

      await prisma.user.delete({
        where: { id },
      });

      res.json({
        success: true,
        message: 'User deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  // ==================== EVENT MANAGEMENT ====================

  getAllEvents: async (req, res, next) => {
    try {
      const { page = 1, limit = 20, search, status } = req.query;

      const where = {};

      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { location: { contains: search, mode: 'insensitive' } },
        ];
      }

      if (status) {
        where.status = status;
      }

      const events = await prisma.event.findMany({
        where,
        include: {
          organizer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          _count: {
            select: {
              tickets: true,
              registrations: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      });

      const total = await prisma.event.count({ where });

      res.json({
        success: true,
        data: events,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  getEventById: async (req, res, next) => {
    try {
      const { id } = req.params;

      const event = await prisma.event.findUnique({
        where: { id },
        include: {
          organizer: true,
          tickets: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
          registrations: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
          _count: {
            select: {
              tickets: true,
              registrations: true,
            },
          },
        },
      });

      if (!event) {
        return res.status(404).json({
          success: false,
          message: 'Event not found',
        });
      }

      res.json({
        success: true,
        data: event,
      });
    } catch (error) {
      next(error);
    }
  },

  approveEvent: async (req, res, next) => {
    try {
      const { id } = req.params;

      const event = await prisma.event.findUnique({
        where: { id },
      });

      if (!event) {
        return res.status(404).json({
          success: false,
          message: 'Event not found',
        });
      }

      if (event.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Event is not pending approval',
        });
      }

      const updatedEvent = await prisma.event.update({
        where: { id },
        data: { status: 'upcoming' },
      });

      await logAdminAction(
        req.user.id,
        'approve_event',
        'event',
        id,
        {},
        req
      );

      res.json({
        success: true,
        message: 'Event approved successfully',
        data: updatedEvent,
      });
    } catch (error) {
      next(error);
    }
  },

  rejectEvent: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const event = await prisma.event.findUnique({
        where: { id },
      });

      if (!event) {
        return res.status(404).json({
          success: false,
          message: 'Event not found',
        });
      }

      if (event.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Event is not pending approval',
        });
      }

      const updatedEvent = await prisma.event.update({
        where: { id },
        data: { status: 'rejected' },
      });

      await logAdminAction(
        req.user.id,
        'reject_event',
        'event',
        id,
        { reason: reason || 'No reason provided' },
        req
      );

      // TODO: Send notification to event organizer with rejection reason

      res.json({
        success: true,
        message: 'Event rejected',
        data: updatedEvent,
      });
    } catch (error) {
      next(error);
    }
  },

  deleteEvent: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      await logAdminAction(
        req.user.id,
        'delete_event',
        'event',
        id,
        { reason },
        req
      );

      await prisma.event.delete({
        where: { id },
      });

      res.json({
        success: true,
        message: 'Event deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  // Get total service fees from all paid events ($5 per ticket)
  getEventServiceFees: async (req, res, next) => {
    try {
      // Count all tickets sold for paid events
      const ticketCount = await prisma.ticket.count({
        where: {
          status: 'confirmed',
          event: {
            isFree: false,
          },
        },
      });

      // Calculate total service fees ($5 per ticket)
      const totalServiceFees = ticketCount * 5;

      res.json({
        success: true,
        data: {
          totalServiceFees: parseFloat(totalServiceFees.toFixed(2)),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Create event as admin (auto-approved, goes live immediately)
  // Admin can assign a different user as the organizer
  createEvent: async (req, res, next) => {
    try {
      const {
        title,
        eventType,
        description,
        startDate,
        endDate,
        startTime,
        endTime,
        venue,
        location,
        isFree,
        ticketPrice,
        currency,
        totalTickets,
        visibility,
        category,
        organizerId, // NEW: Admin can specify which user is the organizer
      } = req.body;

      // Determine the organizer - if organizerId is provided, use that user; otherwise use admin
      let finalOrganizerId = req.user.id;

      if (organizerId && organizerId !== req.user.id) {
        // Verify the organizer exists
        const organizer = await prisma.user.findUnique({
          where: { id: organizerId },
          include: {
            stripeAccount: true,
          },
        });

        if (!organizer) {
          return res.status(400).json({
            success: false,
            message: 'Selected organizer not found',
          });
        }

        finalOrganizerId = organizerId;

        // Warn if paid event but organizer has no Stripe
        const isPaidEvent = !(isFree === 'true' || isFree === true);
        if (isPaidEvent && !organizer.stripeAccount?.chargesEnabled) {
          console.log(`Warning: Creating paid event for organizer ${organizerId} who has not connected Stripe`);
        }
      }

      // Upload banner image to Cloudinary if provided
      let coverImage = null;
      if (req.file) {
        coverImage = await uploadToCloudinary(
          req.file.buffer,
          'event',
          req.user.id
        );
      }

      // Parse dates
      const startDateTime = new Date(`${startDate}T${startTime}`);
      const endDateTime = new Date(`${endDate}T${endTime}`);

      // Create event with 'upcoming' status (admin-created events go live immediately)
      const event = await prisma.event.create({
        data: {
          title,
          description,
          category: category || 'General',
          venue: venue || '',
          location: location || '',
          startDate: startDateTime,
          endDate: endDateTime,
          startTime,
          endTime,
          coverImage,
          images: coverImage ? [coverImage] : [],
          isFree: isFree === 'true' || isFree === true,
          ticketPrice: isFree === 'true' || isFree === true ? null : parseFloat(ticketPrice) || null,
          totalTickets: totalTickets ? parseInt(totalTickets) : null,
          availableTickets: totalTickets ? parseInt(totalTickets) : null,
          status: 'upcoming', // Admin-created events are auto-approved
          organizerId: finalOrganizerId,
        },
        include: {
          organizer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              photo: true,
              stripeAccount: {
                select: {
                  chargesEnabled: true,
                },
              },
            },
          },
        },
      });

      // Log admin action
      await logAdminAction(
        req.user.id,
        'create_event',
        'event',
        event.id,
        {
          title,
          category,
          isFree: isFree === 'true' || isFree === true,
          assignedOrganizerId: finalOrganizerId,
        },
        req
      );

      res.status(201).json({
        success: true,
        message: 'Event created successfully and is now live',
        data: event,
      });
    } catch (error) {
      console.error('Admin create event error:', error);
      next(error);
    }
  },

  // ==================== MARKETPLACE MANAGEMENT ====================

  getAllListings: async (req, res, next) => {
    try {
      const { page = 1, limit = 20, search, status, category } = req.query;

      const where = {};

      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }

      if (status) {
        where.status = status;
      }

      if (category) {
        where.category = category;
      }

      const listings = await prisma.listing.findMany({
        where,
        include: {
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          _count: {
            select: {
              likes: true,
              saves: true,
              comments: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      });

      const total = await prisma.listing.count({ where });

      res.json({
        success: true,
        data: listings,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  getListingById: async (req, res, next) => {
    try {
      const { id } = req.params;

      const listing = await prisma.listing.findUnique({
        where: { id },
        include: {
          seller: true,
          likes: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      });

      if (!listing) {
        return res.status(404).json({
          success: false,
          message: 'Listing not found',
        });
      }

      res.json({
        success: true,
        data: listing,
      });
    } catch (error) {
      next(error);
    }
  },

  approveListing: async (req, res, next) => {
    try {
      const { id } = req.params;

      const listing = await prisma.listing.update({
        where: { id },
        data: { status: 'active' },
      });

      await logAdminAction(
        req.user.id,
        'approve_listing',
        'listing',
        id,
        {},
        req
      );

      res.json({
        success: true,
        message: 'Listing approved successfully',
        data: listing,
      });
    } catch (error) {
      next(error);
    }
  },

  flagListing: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const listing = await prisma.listing.update({
        where: { id },
        data: { status: 'flagged' },
      });

      await logAdminAction(
        req.user.id,
        'flag_listing',
        'listing',
        id,
        { reason },
        req
      );

      res.json({
        success: true,
        message: 'Listing flagged successfully',
        data: listing,
      });
    } catch (error) {
      next(error);
    }
  },

  deleteListing: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      await logAdminAction(
        req.user.id,
        'delete_listing',
        'listing',
        id,
        { reason },
        req
      );

      await prisma.listing.delete({
        where: { id },
      });

      res.json({
        success: true,
        message: 'Listing deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  // ==================== PAYOUTS MANAGEMENT ====================

  /**
   * Get all payouts with filters
   * Includes both Stripe and manual payouts
   */
  getAllPayouts: async (req, res, next) => {
    try {
      const { page = 1, limit = 20, status, payoutMethod } = req.query;

      const where = {};

      if (status) {
        where.status = status;
      }

      if (payoutMethod) {
        where.payoutMethod = payoutMethod;
      }

      const payouts = await prisma.payout.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          payment: {
            select: {
              id: true,
              totalAmount: true,
              metadata: true,
            },
          },
          stripeAccount: {
            select: {
              id: true,
              stripeAccountId: true,
              businessName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      });

      const total = await prisma.payout.count({ where });

      // Format payouts for response
      const formattedPayouts = payouts.map((payout) => ({
        id: payout.id,
        amount: payout.amount / 100, // Convert cents to dollars
        status: payout.status,
        payoutMethod: payout.payoutMethod,
        scheduledFor: payout.scheduledFor,
        processedAt: payout.processedAt,
        organizer: payout.user,
        eventId: payout.eventId,
        stripeTransferId: payout.stripeTransferId,
        hasStripeAccount: !!payout.stripeAccountId,
        stripeAccountName: payout.stripeAccount?.businessName,
        createdAt: payout.createdAt,
      }));

      res.json({
        success: true,
        data: formattedPayouts,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get pending manual payouts (organizers without Stripe)
   */
  getPendingManualPayouts: async (req, res, next) => {
    try {
      const now = new Date();

      const manualPayouts = await prisma.payout.findMany({
        where: {
          payoutMethod: 'manual',
          status: 'pending',
          scheduledFor: {
            lte: now,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          payment: {
            select: {
              id: true,
              totalAmount: true,
              metadata: true,
            },
          },
        },
        orderBy: { scheduledFor: 'asc' },
      });

      // Format for admin view
      const formattedPayouts = manualPayouts.map((payout) => ({
        id: payout.id,
        amount: payout.amount / 100, // Convert cents to dollars
        currency: payout.currency,
        eventId: payout.eventId,
        scheduledFor: payout.scheduledFor,
        organizer: {
          ...payout.user,
          // Include contact info for manual payout
        },
        payment: payout.payment,
        createdAt: payout.createdAt,
      }));

      res.json({
        success: true,
        data: formattedPayouts,
        meta: {
          total: formattedPayouts.length,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Mark a manual payout as paid
   * Used after admin transfers funds outside of Stripe
   */
  markPayoutAsPaid: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { notes } = req.body;

      const payout = await prisma.payout.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      if (!payout) {
        return res.status(404).json({
          success: false,
          message: 'Payout not found',
        });
      }

      if (payout.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: `Payout is already ${payout.status}`,
        });
      }

      // Update payout status
      const updatedPayout = await prisma.payout.update({
        where: { id },
        data: {
          status: 'paid',
          processedAt: new Date(),
        },
      });

      // Log admin action
      await logAdminAction(
        req.user.id,
        'mark_payout_paid',
        'payout',
        id,
        {
          amount: payout.amount / 100,
          organizer: `${payout.user.firstName} ${payout.user.lastName}`,
          notes,
        },
        req
      );

      res.json({
        success: true,
        message: 'Payout marked as paid',
        data: {
          id: updatedPayout.id,
          status: updatedPayout.status,
          processedAt: updatedPayout.processedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // ==================== PAYOUT MANAGEMENT ====================

  /**
   * Get payout statistics summary
   */
  getPayoutStats: async (req, res, next) => {
    try {
      const [
        totalPending,
        totalPaid,
        totalFailed,
        pendingStripe,
        pendingManual,
        pendingAmount,
        paidAmount,
      ] = await Promise.all([
        prisma.payout.count({ where: { status: 'pending' } }),
        prisma.payout.count({ where: { status: 'paid' } }),
        prisma.payout.count({ where: { status: 'failed' } }),
        prisma.payout.count({ where: { status: 'pending', payoutMethod: 'stripe' } }),
        prisma.payout.count({ where: { status: 'pending', payoutMethod: 'manual' } }),
        prisma.payout.aggregate({
          _sum: { amount: true },
          where: { status: 'pending' },
        }),
        prisma.payout.aggregate({
          _sum: { amount: true },
          where: { status: 'paid' },
        }),
      ]);

      res.json({
        success: true,
        data: {
          counts: {
            pending: totalPending,
            paid: totalPaid,
            failed: totalFailed,
            pendingStripe,
            pendingManual,
          },
          amounts: {
            pending: (pendingAmount._sum.amount || 0) / 100,
            paid: (paidAmount._sum.amount || 0) / 100,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get all payouts with detailed filtering
   */
  getPayoutsDetailed: async (req, res, next) => {
    try {
      const { page = 1, limit = 20, status, payoutMethod, search } = req.query;

      const where = {};

      if (status && status !== 'all') {
        where.status = status;
      }

      if (payoutMethod && payoutMethod !== 'all') {
        where.payoutMethod = payoutMethod;
      }

      if (search) {
        where.OR = [
          { user: { firstName: { contains: search, mode: 'insensitive' } } },
          { user: { lastName: { contains: search, mode: 'insensitive' } } },
          { user: { email: { contains: search, mode: 'insensitive' } } },
        ];
      }

      const payouts = await prisma.payout.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              stripeAccount: {
                select: {
                  stripeAccountId: true,
                  chargesEnabled: true,
                  payoutsEnabled: true,
                  businessName: true,
                },
              },
            },
          },
          payment: {
            select: {
              id: true,
              totalAmount: true,
              platformFee: true,
              organizerAmount: true,
              status: true,
            },
          },
        },
        orderBy: [
          { status: 'asc' }, // pending first
          { scheduledFor: 'asc' },
        ],
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      });

      const total = await prisma.payout.count({ where });

      // Fetch events separately (Payout has eventId but no relation)
      const eventIds = [...new Set(payouts.map(p => p.eventId).filter(Boolean))];
      const events = eventIds.length > 0 ? await prisma.event.findMany({
        where: { id: { in: eventIds } },
        select: {
          id: true,
          title: true,
          startDate: true,
          endDate: true,
          ticketPrice: true,
        },
      }) : [];
      const eventsMap = new Map(events.map(e => [e.id, e]));

      // Format payouts
      const formattedPayouts = payouts.map((payout) => {
        const event = payout.eventId ? eventsMap.get(payout.eventId) : null;
        return {
          id: payout.id,
          amount: payout.amount / 100,
          currency: payout.currency,
          status: payout.status,
          payoutMethod: payout.payoutMethod,
          scheduledFor: payout.scheduledFor,
          processedAt: payout.processedAt,
          failureReason: payout.failureReason,
          stripeTransferId: payout.stripeTransferId,
          organizer: {
            id: payout.user.id,
            name: `${payout.user.firstName} ${payout.user.lastName}`,
            email: payout.user.email,
            phone: payout.user.phone,
            hasStripe: payout.user.stripeAccount?.chargesEnabled || false,
            stripeAccountId: payout.user.stripeAccount?.stripeAccountId || null,
          },
          event: event ? {
            id: event.id,
            title: event.title,
            startDate: event.startDate,
            endDate: event.endDate,
            ticketPrice: event.ticketPrice,
          } : null,
          createdAt: payout.createdAt,
        };
      });

      res.json({
        success: true,
        data: formattedPayouts,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Process all pending Stripe payouts (for events that have ended)
   */
  processStripePayout: async (req, res, next) => {
    try {
      const stripe = require('../config/stripe').stripe;
      const now = new Date();

      // Find pending STRIPE payouts for events that have ended
      const pendingPayouts = await prisma.payout.findMany({
        where: {
          status: 'pending',
          payoutMethod: 'stripe',
          stripeAccountId: { not: null },
          scheduledFor: { lte: now },
        },
        include: {
          stripeAccount: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      if (pendingPayouts.length === 0) {
        return res.json({
          success: true,
          message: 'No pending Stripe payouts to process',
          data: { processed: 0, results: [] },
        });
      }

      const results = [];

      for (const payout of pendingPayouts) {
        try {
          // Create transfer to connected account
          const transfer = await stripe.transfers.create({
            amount: payout.amount,
            currency: payout.currency,
            destination: payout.stripeAccount.stripeAccountId,
            transfer_group: `event_${payout.eventId}`,
            metadata: {
              payoutId: payout.id,
              eventId: payout.eventId,
              paymentId: payout.paymentId,
            },
          });

          // Update payout status
          await prisma.payout.update({
            where: { id: payout.id },
            data: {
              status: 'paid',
              stripeTransferId: transfer.id,
              processedAt: new Date(),
            },
          });

          // Log admin action
          await logAdminAction(
            req.user.id,
            'process_stripe_payout',
            'payout',
            payout.id,
            {
              amount: payout.amount / 100,
              organizer: `${payout.user.firstName} ${payout.user.lastName}`,
              transferId: transfer.id,
            },
            req
          );

          results.push({
            payoutId: payout.id,
            status: 'success',
            transferId: transfer.id,
            amount: payout.amount / 100,
          });
        } catch (error) {
          // Update payout with failure
          await prisma.payout.update({
            where: { id: payout.id },
            data: {
              status: 'failed',
              failureReason: error.message,
            },
          });

          results.push({
            payoutId: payout.id,
            status: 'failed',
            error: error.message,
          });
        }
      }

      const successCount = results.filter(r => r.status === 'success').length;
      const failedCount = results.filter(r => r.status === 'failed').length;

      res.json({
        success: true,
        message: `Processed ${results.length} payouts: ${successCount} succeeded, ${failedCount} failed`,
        data: {
          processed: results.length,
          succeeded: successCount,
          failed: failedCount,
          results,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Process Stripe payout for a specific event
   */
  processEventPayout: async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const stripe = require('../config/stripe').stripe;

      // Find all pending Stripe payouts for this event
      const pendingPayouts = await prisma.payout.findMany({
        where: {
          eventId,
          status: 'pending',
          payoutMethod: 'stripe',
          stripeAccountId: { not: null },
        },
        include: {
          stripeAccount: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      if (pendingPayouts.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No pending Stripe payouts found for this event',
        });
      }

      // Fetch event title separately
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { title: true },
      });

      const results = [];

      for (const payout of pendingPayouts) {
        try {
          // Create transfer to connected account
          const transfer = await stripe.transfers.create({
            amount: payout.amount,
            currency: payout.currency,
            destination: payout.stripeAccount.stripeAccountId,
            transfer_group: `event_${payout.eventId}`,
            metadata: {
              payoutId: payout.id,
              eventId: payout.eventId,
              paymentId: payout.paymentId,
            },
          });

          // Update payout status
          await prisma.payout.update({
            where: { id: payout.id },
            data: {
              status: 'paid',
              stripeTransferId: transfer.id,
              processedAt: new Date(),
            },
          });

          // Log admin action
          await logAdminAction(
            req.user.id,
            'process_event_payout',
            'payout',
            payout.id,
            {
              eventId,
              amount: payout.amount / 100,
              organizer: `${payout.user.firstName} ${payout.user.lastName}`,
              transferId: transfer.id,
            },
            req
          );

          results.push({
            payoutId: payout.id,
            status: 'success',
            transferId: transfer.id,
            amount: payout.amount / 100,
          });
        } catch (error) {
          // Update payout with failure
          await prisma.payout.update({
            where: { id: payout.id },
            data: {
              status: 'failed',
              failureReason: error.message,
            },
          });

          results.push({
            payoutId: payout.id,
            status: 'failed',
            error: error.message,
          });
        }
      }

      const successCount = results.filter(r => r.status === 'success').length;
      const failedCount = results.filter(r => r.status === 'failed').length;
      const totalAmount = results
        .filter(r => r.status === 'success')
        .reduce((sum, r) => sum + r.amount, 0);

      res.json({
        success: true,
        message: `Processed ${results.length} payouts for event: ${successCount} succeeded, ${failedCount} failed`,
        data: {
          eventId,
          eventTitle: event?.title,
          processed: results.length,
          succeeded: successCount,
          failed: failedCount,
          totalAmount,
          results,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Migrate a specific organizer's manual payouts to Stripe
   * (after they've connected their Stripe account)
   */
  migrateManualToStripe: async (req, res, next) => {
    try {
      const { userId } = req.params;

      // Check if user has Stripe connected
      const stripeAccount = await prisma.stripeAccount.findUnique({
        where: { userId },
      });

      if (!stripeAccount) {
        return res.status(400).json({
          success: false,
          message: 'User has not connected a Stripe account',
        });
      }

      if (!stripeAccount.chargesEnabled || !stripeAccount.payoutsEnabled) {
        return res.status(400).json({
          success: false,
          message: 'User\'s Stripe account is not fully enabled',
        });
      }

      // Migrate all pending manual payouts to Stripe
      const result = await prisma.payout.updateMany({
        where: {
          userId,
          payoutMethod: 'manual',
          status: 'pending',
        },
        data: {
          payoutMethod: 'stripe',
          stripeAccountId: stripeAccount.id,
        },
      });

      // Log admin action
      await logAdminAction(
        req.user.id,
        'migrate_payouts_to_stripe',
        'user',
        userId,
        { migratedCount: result.count },
        req
      );

      res.json({
        success: true,
        message: `Migrated ${result.count} pending payouts to Stripe`,
        data: { migratedCount: result.count },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Retry a failed payout
   */
  retryPayout: async (req, res, next) => {
    try {
      const { id } = req.params;
      const stripe = require('../config/stripe').stripe;

      const payout = await prisma.payout.findUnique({
        where: { id },
        include: {
          stripeAccount: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      if (!payout) {
        return res.status(404).json({
          success: false,
          message: 'Payout not found',
        });
      }

      if (payout.status !== 'failed') {
        return res.status(400).json({
          success: false,
          message: 'Can only retry failed payouts',
        });
      }

      if (payout.payoutMethod !== 'stripe' || !payout.stripeAccount) {
        return res.status(400).json({
          success: false,
          message: 'Can only retry Stripe payouts',
        });
      }

      // Try the transfer again
      const transfer = await stripe.transfers.create({
        amount: payout.amount,
        currency: payout.currency,
        destination: payout.stripeAccount.stripeAccountId,
        transfer_group: `event_${payout.eventId}`,
        metadata: {
          payoutId: payout.id,
          eventId: payout.eventId,
          paymentId: payout.paymentId,
          isRetry: 'true',
        },
      });

      // Update payout status
      await prisma.payout.update({
        where: { id },
        data: {
          status: 'paid',
          stripeTransferId: transfer.id,
          processedAt: new Date(),
          failureReason: null,
        },
      });

      // Log admin action
      await logAdminAction(
        req.user.id,
        'retry_payout',
        'payout',
        id,
        {
          amount: payout.amount / 100,
          organizer: `${payout.user.firstName} ${payout.user.lastName}`,
          transferId: transfer.id,
        },
        req
      );

      res.json({
        success: true,
        message: 'Payout retried successfully',
        data: {
          transferId: transfer.id,
          amount: payout.amount / 100,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // ==================== AUDIT LOGS ====================

  getAuditLogs: async (req, res, next) => {
    try {
      const { page = 1, limit = 50, adminId, action, targetType } = req.query;

      const where = {};

      if (adminId) {
        where.adminId = adminId;
      }

      if (action) {
        where.action = action;
      }

      if (targetType) {
        where.targetType = targetType;
      }

      const logs = await prisma.adminAuditLog.findMany({
        where,
        include: {
          admin: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      });

      const total = await prisma.adminAuditLog.count({ where });

      res.json({
        success: true,
        data: logs,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = adminController;
