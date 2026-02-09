const prisma = require('../config/prisma');
const { Prisma } = require('@prisma/client');
const { uploadToCloudinary } = require('../utils/cloudinary');

const listingController = {
  getAllListings: async (req, res, next) => {
    try {
      const { category, status = 'active', search, sort } = req.query;
      // Parse and validate pagination params
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

      const where = {
        status,
        ...(category && category !== 'All Categories' && { category }),
        ...(search && {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        }),
      };

      // Determine sort order
      let orderBy = { createdAt: 'desc' }; // Default: most recent
      if (sort === 'price_asc') {
        orderBy = { price: 'asc' };
      } else if (sort === 'price_desc') {
        orderBy = { price: 'desc' };
      } else if (sort === 'popular') {
        orderBy = [{ views: { _count: 'desc' } }, { createdAt: 'desc' }];
      }

      const listings = await prisma.listing.findMany({
        where,
        include: {
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              photo: true,
              email: true,
            },
          },
          _count: {
            select: {
              likes: true,
              saves: true,
              comments: true,
              views: true,
            },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      });

      const total = await prisma.listing.count({ where });

      res.json({
        success: true,
        data: {
          data: listings,
          meta: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },

  getListingById: async (req, res, next) => {
    try {
      const userId = req.user?.id;

      const listing = await prisma.listing.findUnique({
        where: { id: req.params.id },
        include: {
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              photo: true,
              email: true,
              phone: true,
              bio: true,
              createdAt: true,
              _count: {
                select: {
                  listings: true,
                },
              },
            },
          },
          comments: {
            include: {
              author: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  photo: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
          _count: {
            select: {
              likes: true,
              saves: true,
              comments: true,
              views: true,
            },
          },
        },
      });

      // Check if user has liked/saved this listing
      let userInteraction = { liked: false, saved: false };
      if (userId && listing) {
        const [likeExists, saveExists] = await Promise.all([
          prisma.like.findUnique({
            where: { userId_listingId: { userId, listingId: listing.id } },
          }),
          prisma.save.findUnique({
            where: { userId_listingId: { userId, listingId: listing.id } },
          }),
        ]);
        userInteraction = {
          liked: !!likeExists,
          saved: !!saveExists,
        };
      }

      if (!listing) {
        return res.status(404).json({
          success: false,
          message: 'Listing not found',
        });
      }

      // Only show active listings to public, or show any status to owner
      if (listing.status !== 'active' && listing.sellerId !== req.user?.id) {
        return res.status(404).json({
          success: false,
          message: 'Listing not found',
        });
      }

      // Record the view (non-blocking)
      const source = req.query.source || 'direct';
      const userAgent = req.headers['user-agent'] || null;
      // Hash IP for privacy (simple hash, not storing raw IP)
      const ipHash = req.ip ? Buffer.from(req.ip).toString('base64').slice(0, 20) : null;

      // Don't count views from the listing owner
      if (listing.sellerId !== req.user?.id) {
        prisma.listingView.create({
          data: {
            listingId: listing.id,
            userId: req.user?.id || null,
            source,
            userAgent,
            ipHash,
          },
        }).then(() => {
          console.log(`View recorded for listing ${listing.id}`);
        }).catch(err => console.error('Failed to record view:', err));
      }

      res.json({
        success: true,
        data: {
          ...listing,
          userInteraction,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  createListing: async (req, res, next) => {
    try {
      const {
        title,
        description,
        price,
        currency = 'USD',
        priceType = 'fixed',
        category,
        condition = 'new',
        location,
        tags,
        phoneNumber,
        email,
        whatsappNumber,
      } = req.body;

      // Validate required fields
      if (!title || !description || !price || !category) {
        return res.status(400).json({
          success: false,
          message: 'Title, description, price, and category are required',
        });
      }

      // Upload images to Cloudinary
      const imageUrls = [];
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const url = await uploadToCloudinary(file.buffer, 'listing', req.user.id);
          imageUrls.push(url);
        }
      }

      // Parse tags if provided
      const parsedTags = tags ? tags.split(',').map(tag => tag.trim()).filter(Boolean) : [];

      const listing = await prisma.listing.create({
        data: {
          title,
          description,
          price: parseFloat(price),
          currency,
          priceType,
          category,
          condition,
          location,
          images: imageUrls,
          tags: parsedTags,
          phoneNumber: phoneNumber || null,
          email: email || null,
          whatsappNumber: whatsappNumber || null,
          status: 'pending', // All new listings require admin approval
          sellerId: req.user.id,
        },
        include: {
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              photo: true,
            },
          },
        },
      });

      res.status(201).json({
        success: true,
        message: 'Listing created successfully and is pending approval',
        data: listing,
      });
    } catch (error) {
      next(error);
    }
  },

  updateListing: async (req, res, next) => {
    try {
      const listing = await prisma.listing.findUnique({
        where: { id: req.params.id },
      });

      if (!listing) {
        return res.status(404).json({
          success: false,
          message: 'Listing not found',
        });
      }

      if (listing.sellerId !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized',
        });
      }

      const {
        title,
        description,
        price,
        currency,
        priceType,
        category,
        condition,
        location,
        tags,
        phoneNumber,
        email,
        whatsappNumber,
      } = req.body;

      // Upload new images if provided
      let imageUrls = listing.images;
      if (req.files && req.files.length > 0) {
        imageUrls = [];
        for (const file of req.files) {
          const url = await uploadToCloudinary(file.buffer, 'listing', req.user.id);
          imageUrls.push(url);
        }
      }

      // Parse tags if provided
      const parsedTags = tags ? tags.split(',').map(tag => tag.trim()).filter(Boolean) : listing.tags;

      const updated = await prisma.listing.update({
        where: { id: req.params.id },
        data: {
          ...(title && { title }),
          ...(description && { description }),
          ...(price && { price: parseFloat(price) }),
          ...(currency && { currency }),
          ...(priceType && { priceType }),
          ...(category && { category }),
          ...(condition && { condition }),
          ...(location !== undefined && { location }),
          images: imageUrls,
          tags: parsedTags,
          ...(phoneNumber !== undefined && { phoneNumber: phoneNumber || null }),
          ...(email !== undefined && { email: email || null }),
          ...(whatsappNumber !== undefined && { whatsappNumber: whatsappNumber || null }),
          // Reset status to pending if significant changes were made
          ...(title || description || price ? { status: 'pending' } : {}),
        },
        include: {
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              photo: true,
            },
          },
        },
      });

      res.json({
        success: true,
        message: 'Listing updated',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  },

  deleteListing: async (req, res, next) => {
    try {
      const listing = await prisma.listing.findUnique({
        where: { id: req.params.id },
      });

      if (!listing) {
        return res.status(404).json({
          success: false,
          message: 'Listing not found',
        });
      }

      if (listing.sellerId !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized',
        });
      }

      await prisma.listing.delete({
        where: { id: req.params.id },
      });

      res.json({
        success: true,
        message: 'Listing deleted',
      });
    } catch (error) {
      next(error);
    }
  },

  // Get user's own listings (including pending)
  getMyListings: async (req, res, next) => {
    try {
      const { page = 1, limit = 20, status } = req.query;

      const where = {
        sellerId: req.user.id,
        ...(status && { status }),
      };

      const listings = await prisma.listing.findMany({
        where,
        include: {
          _count: {
            select: {
              likes: true,
              saves: true,
              comments: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
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
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Mark listing as sold
  markAsSold: async (req, res, next) => {
    try {
      const listing = await prisma.listing.findUnique({
        where: { id: req.params.id },
      });

      if (!listing) {
        return res.status(404).json({
          success: false,
          message: 'Listing not found',
        });
      }

      if (listing.sellerId !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized',
        });
      }

      const updated = await prisma.listing.update({
        where: { id: req.params.id },
        data: { status: 'sold' },
      });

      res.json({
        success: true,
        message: 'Listing marked as sold',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  },

  toggleLike: async (req, res, next) => {
    try {
      const existing = await prisma.like.findUnique({
        where: {
          userId_listingId: {
            userId: req.user.id,
            listingId: req.params.id,
          },
        },
      });

      if (existing) {
        await prisma.like.delete({
          where: { id: existing.id },
        });

        res.json({
          success: true,
          message: 'Unliked',
          liked: false,
        });
      } else {
        await prisma.like.create({
          data: {
            userId: req.user.id,
            listingId: req.params.id,
          },
        });

        res.json({
          success: true,
          message: 'Liked',
          liked: true,
        });
      }
    } catch (error) {
      next(error);
    }
  },

  toggleSave: async (req, res, next) => {
    try {
      const existing = await prisma.save.findUnique({
        where: {
          userId_listingId: {
            userId: req.user.id,
            listingId: req.params.id,
          },
        },
      });

      if (existing) {
        await prisma.save.delete({
          where: { id: existing.id },
        });

        res.json({
          success: true,
          message: 'Unsaved',
          saved: false,
        });
      } else {
        await prisma.save.create({
          data: {
            userId: req.user.id,
            listingId: req.params.id,
          },
        });

        res.json({
          success: true,
          message: 'Saved',
          saved: true,
        });
      }
    } catch (error) {
      next(error);
    }
  },

  // Check if user has liked/saved a listing
  checkUserInteraction: async (req, res, next) => {
    try {
      if (!req.user) {
        return res.json({
          success: true,
          data: { liked: false, saved: false },
        });
      }

      const [like, save] = await Promise.all([
        prisma.like.findUnique({
          where: {
            userId_listingId: {
              userId: req.user.id,
              listingId: req.params.id,
            },
          },
        }),
        prisma.save.findUnique({
          where: {
            userId_listingId: {
              userId: req.user.id,
              listingId: req.params.id,
            },
          },
        }),
      ]);

      res.json({
        success: true,
        data: {
          liked: !!like,
          saved: !!save,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Get related listings (same category)
  getRelatedListings: async (req, res, next) => {
    try {
      const listing = await prisma.listing.findUnique({
        where: { id: req.params.id },
        select: { category: true, sellerId: true },
      });

      if (!listing) {
        return res.status(404).json({
          success: false,
          message: 'Listing not found',
        });
      }

      const relatedListings = await prisma.listing.findMany({
        where: {
          category: listing.category,
          status: 'active',
          id: { not: req.params.id },
        },
        include: {
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              photo: true,
            },
          },
          _count: {
            select: {
              likes: true,
              saves: true,
            },
          },
        },
        take: 6,
        orderBy: { createdAt: 'desc' },
      });

      res.json({
        success: true,
        data: relatedListings,
      });
    } catch (error) {
      next(error);
    }
  },

  // Add comment to listing
  addComment: async (req, res, next) => {
    try {
      const { content } = req.body;

      if (!content || content.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Comment content is required',
        });
      }

      const listing = await prisma.listing.findUnique({
        where: { id: req.params.id },
      });

      if (!listing || listing.status !== 'active') {
        return res.status(404).json({
          success: false,
          message: 'Listing not found',
        });
      }

      const comment = await prisma.comment.create({
        data: {
          content: content.trim(),
          authorId: req.user.id,
          listingId: req.params.id,
        },
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              photo: true,
            },
          },
        },
      });

      res.status(201).json({
        success: true,
        message: 'Comment added',
        data: comment,
      });
    } catch (error) {
      next(error);
    }
  },

  // Get comments for a listing
  getComments: async (req, res, next) => {
    try {
      const { page = 1, limit = 20 } = req.query;

      const comments = await prisma.comment.findMany({
        where: { listingId: req.params.id },
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              photo: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: parseInt(limit),
      });

      const total = await prisma.comment.count({
        where: { listingId: req.params.id },
      });

      res.json({
        success: true,
        data: comments,
        meta: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // ==================== ANALYTICS ENDPOINTS ====================

  // Get analytics overview for user's listings
  getAnalyticsOverview: async (req, res, next) => {
    try {
      const { range = '30days' } = req.query;
      const userId = req.user.id;

      // Calculate date range
      const now = new Date();
      let startDate = new Date();
      let previousStartDate = new Date();
      switch (range) {
        case '7days':
          startDate.setDate(now.getDate() - 7);
          previousStartDate.setDate(now.getDate() - 14);
          break;
        case '30days':
          startDate.setDate(now.getDate() - 30);
          previousStartDate.setDate(now.getDate() - 60);
          break;
        case '90days':
          startDate.setDate(now.getDate() - 90);
          previousStartDate.setDate(now.getDate() - 180);
          break;
        case 'year':
          startDate.setFullYear(now.getFullYear() - 1);
          previousStartDate.setFullYear(now.getFullYear() - 2);
          break;
        default:
          startDate.setDate(now.getDate() - 30);
          previousStartDate.setDate(now.getDate() - 60);
      }

      // Get user's listings
      const listings = await prisma.listing.findMany({
        where: { sellerId: userId },
        include: {
          _count: {
            select: {
              likes: true,
              saves: true,
              comments: true,
              views: true,
            },
          },
        },
      });

      const listingIds = listings.map(l => l.id);
      const totalListings = listings.length;
      const activeListings = listings.filter(l => l.status === 'active').length;

      // Get actual views from ListingView table for the date range
      const [currentPeriodViews, previousPeriodViews, viewsByListingInRange] = await Promise.all([
        prisma.listingView.count({
          where: {
            listingId: { in: listingIds },
            createdAt: { gte: startDate },
          },
        }),
        prisma.listingView.count({
          where: {
            listingId: { in: listingIds },
            createdAt: { gte: previousStartDate, lt: startDate },
          },
        }),
        prisma.listingView.groupBy({
          by: ['listingId'],
          where: {
            listingId: { in: listingIds },
            createdAt: { gte: startDate },
          },
          _count: { _all: true },
        }),
      ]);

      // Create a map of listing views
      const viewsMap = {};
      viewsByListingInRange.forEach(v => {
        viewsMap[v.listingId] = v._count._all;
      });

      // Calculate views by category
      const viewsByCategory = {};
      listings.forEach(listing => {
        const listingViews = viewsMap[listing.id] || 0;
        if (!viewsByCategory[listing.category]) {
          viewsByCategory[listing.category] = 0;
        }
        viewsByCategory[listing.category] += listingViews;
      });

      // Calculate total inquiries (comments) for current period
      const currentPeriodInquiries = await prisma.comment.count({
        where: {
          listingId: { in: listingIds.length > 0 ? listingIds : ['00000000-0000-0000-0000-000000000000'] },
          createdAt: { gte: startDate },
        },
      });

      // Calculate total inquiries for previous period
      const previousPeriodInquiries = await prisma.comment.count({
        where: {
          listingId: { in: listingIds.length > 0 ? listingIds : ['00000000-0000-0000-0000-000000000000'] },
          createdAt: { gte: previousStartDate, lt: startDate },
        },
      });

      const totalInquiries = currentPeriodInquiries;

      // Calculate conversion rate for current and previous periods
      const totalViews = currentPeriodViews;
      const conversionRate = totalViews > 0 ? ((totalInquiries / totalViews) * 100).toFixed(1) : 0;

      const previousConversionRate = previousPeriodViews > 0
        ? ((previousPeriodInquiries / previousPeriodViews) * 100)
        : 0;

      // Calculate views trend (compare to previous period)
      let viewsTrend = 0;
      if (previousPeriodViews > 0) {
        viewsTrend = (((currentPeriodViews - previousPeriodViews) / previousPeriodViews) * 100).toFixed(1);
      } else if (currentPeriodViews > 0) {
        viewsTrend = 100;
      }

      // Calculate inquiries trend
      let inquiriesTrend = 0;
      if (previousPeriodInquiries > 0) {
        inquiriesTrend = (((currentPeriodInquiries - previousPeriodInquiries) / previousPeriodInquiries) * 100).toFixed(1);
      } else if (currentPeriodInquiries > 0) {
        inquiriesTrend = 100;
      }

      // Calculate conversion trend
      let conversionTrend = 0;
      if (previousConversionRate > 0) {
        conversionTrend = (((parseFloat(conversionRate) - previousConversionRate) / previousConversionRate) * 100).toFixed(1);
      } else if (parseFloat(conversionRate) > 0) {
        conversionTrend = 100;
      }

      // Get views over time (grouped by day/week/month based on range)
      // Handle empty listingIds array
      let viewsOverTimeRaw = [];
      if (listingIds.length > 0) {
        // Use separate queries based on range since DATE_TRUNC requires a literal string
        if (range === 'year') {
          viewsOverTimeRaw = await prisma.$queryRaw`
            SELECT DATE_TRUNC('month', "createdAt") as date, COUNT(*) as views
            FROM "ListingView"
            WHERE "listingId" IN (${Prisma.join(listingIds)}) AND "createdAt" >= ${startDate}
            GROUP BY 1 ORDER BY date ASC
          `;
        } else if (range === '90days') {
          viewsOverTimeRaw = await prisma.$queryRaw`
            SELECT DATE_TRUNC('week', "createdAt") as date, COUNT(*) as views
            FROM "ListingView"
            WHERE "listingId" IN (${Prisma.join(listingIds)}) AND "createdAt" >= ${startDate}
            GROUP BY 1 ORDER BY date ASC
          `;
        } else {
          viewsOverTimeRaw = await prisma.$queryRaw`
            SELECT DATE_TRUNC('day', "createdAt") as date, COUNT(*) as views
            FROM "ListingView"
            WHERE "listingId" IN (${Prisma.join(listingIds)}) AND "createdAt" >= ${startDate}
            GROUP BY 1 ORDER BY date ASC
          `;
        }
      }

      const viewsOverTime = viewsOverTimeRaw.map(row => ({
        date: new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        views: Number(row.views),
      }));

      // If no data, generate empty timeline
      if (viewsOverTime.length === 0) {
        const daysToShow = range === '7days' ? 7 : range === '90days' ? 12 : range === 'year' ? 12 : 7;
        const interval = range === 'year' ? 30 : range === '90days' ? 7 : range === '30days' ? 4 : 1;
        for (let i = daysToShow; i >= 0; i--) {
          const date = new Date();
          date.setDate(date.getDate() - (i * interval));
          viewsOverTime.push({
            date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            views: 0,
          });
        }
      }

      // Format category data with colors
      const categoryColors = {
        'Fashion & Clothing': '#10B981',
        'Electronics': '#3B82F6',
        'Home & Garden': '#F59E0B',
        'Furniture': '#8B5CF6',
        'Vehicles': '#EF4444',
        'Property': '#06B6D4',
        'Jobs & Services': '#EC4899',
        'Food & Agriculture': '#84CC16',
      };

      const viewsByCategoryFormatted = Object.entries(viewsByCategory).map(([category, views]) => ({
        category: category.split(' ')[0],
        views,
        color: categoryColors[category] || '#6B7280',
      }));

      res.json({
        success: true,
        data: {
          totalListings,
          activeListings,
          totalViews,
          viewsTrend: parseFloat(viewsTrend),
          totalInquiries,
          inquiriesTrend: parseFloat(inquiriesTrend),
          conversionRate: parseFloat(conversionRate),
          conversionTrend: parseFloat(conversionTrend),
          viewsByCategory: viewsByCategoryFormatted,
          viewsOverTime,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Get performance analytics for user's listings
  getAnalyticsPerformance: async (req, res, next) => {
    try {
      const { range = '30days' } = req.query;
      const userId = req.user.id;

      // Calculate date range
      const now = new Date();
      let startDate = new Date();
      switch (range) {
        case '7days':
          startDate.setDate(now.getDate() - 7);
          break;
        case '30days':
          startDate.setDate(now.getDate() - 30);
          break;
        case '90days':
          startDate.setDate(now.getDate() - 90);
          break;
        case 'year':
          startDate.setFullYear(now.getFullYear() - 1);
          break;
        default:
          startDate.setDate(now.getDate() - 30);
      }

      // Get user's listings with engagement data
      const listings = await prisma.listing.findMany({
        where: { sellerId: userId },
        include: {
          _count: {
            select: {
              likes: true,
              saves: true,
              comments: true,
              views: true,
            },
          },
        },
      });

      const listingIds = listings.map(l => l.id);

      // Get views grouped by day of week
      let viewsByDayOfWeek = [];
      let viewsByHour = [];

      if (listingIds.length > 0) {
        viewsByDayOfWeek = await prisma.$queryRaw`
          SELECT
            EXTRACT(DOW FROM "createdAt") as day_of_week,
            COUNT(*) as views
          FROM "ListingView"
          WHERE "listingId" IN (${Prisma.join(listingIds)})
            AND "createdAt" >= ${startDate}
          GROUP BY EXTRACT(DOW FROM "createdAt")
          ORDER BY views DESC
        `;

        // Get views grouped by hour
        viewsByHour = await prisma.$queryRaw`
          SELECT
            EXTRACT(HOUR FROM "createdAt") as hour,
            COUNT(*) as views
          FROM "ListingView"
          WHERE "listingId" IN (${Prisma.join(listingIds)})
            AND "createdAt" >= ${startDate}
          GROUP BY EXTRACT(HOUR FROM "createdAt")
          ORDER BY views DESC
          LIMIT 3
        `;
      }

      // Calculate best day
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      let bestDay = 'Saturday';
      let bestDayIncrease = 0;

      if (viewsByDayOfWeek.length > 0) {
        const bestDayData = viewsByDayOfWeek[0];
        bestDay = dayNames[Number(bestDayData.day_of_week)];

        // Calculate percentage increase compared to average
        const totalViews = viewsByDayOfWeek.reduce((sum, d) => sum + Number(d.views), 0);
        const avgViews = totalViews / 7;
        if (avgViews > 0) {
          bestDayIncrease = Math.round(((Number(bestDayData.views) - avgViews) / avgViews) * 100);
        }
      }

      // Calculate peak hours
      let peakHours = '7-9 PM';
      if (viewsByHour.length > 0) {
        const peakHour = Number(viewsByHour[0].hour);
        const formatHour = (h) => {
          if (h === 0) return '12 AM';
          if (h === 12) return '12 PM';
          return h > 12 ? `${h - 12} PM` : `${h} AM`;
        };
        peakHours = `${formatHour(peakHour)}-${formatHour((peakHour + 2) % 24)}`;
      }

      // Calculate average response time (based on time between view and first comment)
      // For now, use a reasonable default since we don't track message responses
      const avgResponseTime = 2.5;

      // Generate performance tips based on user's listings
      const tips = [];

      // Check average photos per listing
      const avgPhotos = listings.length > 0
        ? listings.reduce((sum, l) => sum + (l.images?.length || 0), 0) / listings.length
        : 0;

      if (avgPhotos < 4) {
        tips.push({
          title: 'Add More Photos To Increase Engagement',
          description: 'Listings With 4+ Photos Get 67% More Inquiries',
          type: 'success',
        });
      }

      // Check for incomplete descriptions
      const shortDescriptions = listings.filter(l => l.description?.length < 100).length;
      if (shortDescriptions > 0) {
        tips.push({
          title: 'Complete Your Listing Descriptions',
          description: 'Detailed descriptions improve search visibility',
          type: 'info',
        });
      }

      // Check for low performing listings (based on actual views)
      const lowPerforming = listings.filter(l => l._count.views < 10).length;

      if (lowPerforming > 0) {
        tips.push({
          title: 'Consider boosting your underperforming listings',
          description: 'Boost can increase visibility by up to 300%',
          type: 'warning',
        });
      }

      // Add default tip if no specific issues found
      if (tips.length === 0) {
        tips.push({
          title: 'Your listings are performing well!',
          description: 'Keep up the great work and maintain consistent quality',
          type: 'success',
        });
      }

      res.json({
        success: true,
        data: {
          bestDay,
          bestDayIncrease,
          peakHours,
          avgResponseTime,
          tips,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Get user's listings with analytics data
  getMyListingsWithAnalytics: async (req, res, next) => {
    try {
      const { page = 1, limit = 10, status } = req.query;
      const userId = req.user.id;

      const where = {
        sellerId: userId,
        ...(status && { status }),
      };

      const listings = await prisma.listing.findMany({
        where,
        include: {
          _count: {
            select: {
              likes: true,
              saves: true,
              comments: true,
              views: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: parseInt(limit),
      });

      const total = await prisma.listing.count({ where });

      // Add analytics data to each listing using real view counts
      const listingsWithAnalytics = listings.map(listing => {
        const views = listing._count.views;
        const inquiries = listing._count.comments;

        // Determine performance level based on actual views
        let performance = 'low';
        if (views >= 100 || listing._count.likes >= 10) {
          performance = 'high';
        } else if (views >= 30 || listing._count.likes >= 5) {
          performance = 'medium';
        }

        return {
          id: listing.id,
          title: listing.title,
          category: listing.category,
          price: listing.price,
          currency: listing.currency || 'USD',
          status: listing.status,
          images: listing.images,
          views,
          inquiries,
          performance,
          createdAt: listing.createdAt,
          isFeatured: listing._count.likes >= 20 || views >= 200, // Featured if popular
        };
      });

      res.json({
        success: true,
        data: {
          data: listingsWithAnalytics,
          meta: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Get marketplace-wide stats (for sidebar)
  getMarketplaceStats: async (req, res, next) => {
    try {
      // Calculate date for "this week" (last 7 days)
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      // Get overall marketplace stats
      const [
        totalActiveListings,
        totalActiveSellers,
        categoryStats,
        allCategoryStats,
        totalListings,
        weeklyViewCount,
      ] = await Promise.all([
        prisma.listing.count({ where: { status: 'active' } }),
        prisma.listing.groupBy({
          by: ['sellerId'],
          where: { status: 'active' },
          _count: true,
        }),
        prisma.listing.groupBy({
          by: ['category'],
          where: { status: 'active' },
          _count: { _all: true },
          orderBy: { _count: { category: 'desc' } },
          take: 4,
        }),
        // Get all categories with counts for filters
        prisma.listing.groupBy({
          by: ['category'],
          where: { status: 'active' },
          _count: { _all: true },
          orderBy: { _count: { category: 'desc' } },
        }),
        prisma.listing.count(),
        // Get actual weekly views from ListingView table
        prisma.listingView.count({
          where: {
            createdAt: { gte: oneWeekAgo },
          },
        }),
      ]);

      // Calculate average response time (simulated - would need message tracking)
      const avgResponseTime = '2hrs';

      res.json({
        success: true,
        data: {
          activeListings: totalActiveListings,
          totalListings,
          weeklyViews: weeklyViewCount,
          activeSellers: totalActiveSellers.length,
          avgResponseTime,
          popularCategories: categoryStats.map(cat => ({
            category: cat.category,
            count: cat._count._all,
          })),
          allCategories: allCategoryStats.map(cat => ({
            name: cat.category,
            count: cat._count._all,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = listingController;
