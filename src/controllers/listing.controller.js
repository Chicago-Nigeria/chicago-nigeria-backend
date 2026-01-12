const prisma = require('../config/prisma');

const listingController = {
  getAllListings: async (req, res, next) => {
    try {
      const { page = 1, limit = 20, category, status = 'active' } = req.query;

      const listings = await prisma.listing.findMany({
        where: {
          status,
          ...(category && { category }),
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
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: parseInt(limit),
      });

      const total = await prisma.listing.count({
        where: {
          status,
          ...(category && { category }),
        },
      });

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

  getListingById: async (req, res, next) => {
    try {
      const listing = await prisma.listing.findUnique({
        where: { id: req.params.id },
        include: {
          seller: true,
          _count: {
            select: {
              likes: true,
              saves: true,
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

  createListing: async (req, res, next) => {
    try {
      const listing = await prisma.listing.create({
        data: {
          ...req.body,
          sellerId: req.user.id,
        },
      });

      res.status(201).json({
        success: true,
        message: 'Listing created successfully',
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

      const updated = await prisma.listing.update({
        where: { id: req.params.id },
        data: req.body,
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
};

module.exports = listingController;
