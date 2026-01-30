const prisma = require('../config/prisma');

const feedController = {
  // Get active promoted content for the feed
  getActivePromotedContent: async (req, res, next) => {
    try {
      const { limit = 10 } = req.query;
      const now = new Date();

      const promotedContent = await prisma.promotedContent.findMany({
        where: {
          isActive: true,
          contentType: 'event',
          startDate: { lte: now },
          OR: [
            { endDate: null },
            { endDate: { gte: now } },
          ],
          // Only include events that are upcoming or ongoing
          event: {
            status: { in: ['upcoming', 'ongoing', 'approved'] },
          },
        },
        include: {
          event: {
            include: {
              organizer: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  photo: true,
                },
              },
              _count: {
                select: {
                  registrations: true,
                  tickets: true,
                },
              },
            },
          },
        },
        orderBy: [
          { priority: 'desc' },
          { lastShownAt: 'asc' }, // Show least recently shown first
          { createdAt: 'desc' },
        ],
        take: parseInt(limit),
      });

      // Filter out any null events (in case event was deleted)
      const validPromotedContent = promotedContent.filter(pc => pc.event !== null);

      res.json({
        success: true,
        data: validPromotedContent,
      });
    } catch (error) {
      next(error);
    }
  },

  // Record impression when promoted content is viewed
  recordImpression: async (req, res, next) => {
    try {
      const { id } = req.params;

      const existing = await prisma.promotedContent.findUnique({
        where: { id },
      });

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'Promoted content not found',
        });
      }

      await prisma.promotedContent.update({
        where: { id },
        data: {
          impressions: { increment: 1 },
          lastShownAt: new Date(),
        },
      });

      res.json({
        success: true,
        message: 'Impression recorded',
      });
    } catch (error) {
      next(error);
    }
  },

  // Record click when user interacts with promoted content
  recordClick: async (req, res, next) => {
    try {
      const { id } = req.params;

      const existing = await prisma.promotedContent.findUnique({
        where: { id },
      });

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'Promoted content not found',
        });
      }

      await prisma.promotedContent.update({
        where: { id },
        data: {
          clicks: { increment: 1 },
        },
      });

      res.json({
        success: true,
        message: 'Click recorded',
      });
    } catch (error) {
      next(error);
    }
  },

  // Get community stats for the feed sidebar
  getCommunityStats: async (req, res, next) => {
    try {
      const now = new Date();

      // Start of today (midnight)
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Start of this week (Sunday)
      const dayOfWeek = now.getDay();
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);

      // End of this week (Saturday 11:59:59 PM)
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 7);

      // Get stats in parallel for better performance
      const [activeMembers, postsToday, eventsThisWeek] = await Promise.all([
        // Active members: users who are active and verified
        // (have created a post, comment, or like in the last 30 days, or recently joined)
        prisma.user.count({
          where: {
            isActive: true,
            OR: [
              { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
              { posts: { some: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } } },
              { comments: { some: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } } },
              { likes: { some: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } } },
            ],
          },
        }),

        // Posts created today
        prisma.post.count({
          where: {
            createdAt: { gte: startOfToday },
          },
        }),

        // Events happening this week (starts between Sunday and Saturday)
        prisma.event.count({
          where: {
            status: { in: ['upcoming', 'ongoing', 'approved'] },
            startDate: {
              gte: startOfWeek,
              lt: endOfWeek,
            },
          },
        }),
      ]);

      res.json({
        success: true,
        data: {
          activeMembers,
          postsToday,
          eventsThisWeek,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = feedController;
