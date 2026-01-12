const prisma = require('../config/prisma');
const { uploadToCloudinary } = require('../utils/cloudinary');

const eventController = {
  getAllEvents: async (req, res, next) => {
    // Similar to listings - implement pagination and filtering
    try {
      const events = await prisma.event.findMany({
        where: {
          status: {
            in: ['approved', 'upcoming', 'ongoing'], // Only show approved and active events
          },
        },
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
              tickets: true,
              registrations: true,
            },
          },
        },
        orderBy: { startDate: 'desc' },
      });

      res.json({
        success: true,
        data: events,
      });
    } catch (error) {
      next(error);
    }
  },

  getEventById: async (req, res, next) => {
    // Implementation here
    res.json({ success: true, message: 'Get event by ID - TODO' });
  },

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
      } = req.body;

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

      // Create event with pending status (awaits admin approval)
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
          status: 'pending',
          organizerId: req.user.id,
        },
        include: {
          organizer: {
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
        message: 'Event created successfully',
        data: event,
      });
    } catch (error) {
      console.error('Create event error:', error);
      next(error);
    }
  },

  updateEvent: async (req, res, next) => {
    // Implementation here
    res.json({ success: true, message: 'Update event - TODO' });
  },

  deleteEvent: async (req, res, next) => {
    // Implementation here
    res.json({ success: true, message: 'Delete event - TODO' });
  },

  registerForEvent: async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const { firstName, lastName, email, phone } = req.body;

      // Get event
      const event = await prisma.event.findUnique({
        where: { id: eventId },
      });

      if (!event) {
        return res.status(404).json({
          success: false,
          message: 'Event not found',
        });
      }

      // Check if event is free
      if (!event.isFree) {
        return res.status(400).json({
          success: false,
          message: 'This endpoint is only for free events. Please use the purchase ticket endpoint for paid events.',
        });
      }

      // Check if user is already registered
      const existingRegistration = await prisma.eventRegistration.findUnique({
        where: {
          userId_eventId: {
            userId: req.user.id,
            eventId: eventId,
          },
        },
      });

      if (existingRegistration) {
        return res.status(400).json({
          success: false,
          message: 'You are already registered for this event',
        });
      }

      // Create registration
      const registration = await prisma.eventRegistration.create({
        data: {
          eventId,
          userId: req.user.id,
          firstName,
          lastName,
          email,
          phone,
        },
        include: {
          event: {
            select: {
              id: true,
              title: true,
              startDate: true,
              startTime: true,
              venue: true,
              location: true,
              coverImage: true,
            },
          },
        },
      });

      res.status(201).json({
        success: true,
        message: 'Successfully registered for event',
        data: registration,
      });
    } catch (error) {
      console.error('Register for event error:', error);
      next(error);
    }
  },

  purchaseTicket: async (req, res, next) => {
    // TODO: Implement ticket purchase functionality for paid events
    // Service Fee Structure: $5 per ticket (flat rate, not percentage-based)
    // Calculate total: (ticketPrice * quantity) + (SERVICE_FEE_PER_TICKET * quantity)
    // where SERVICE_FEE_PER_TICKET = 5
    res.json({ success: true, message: 'Purchase ticket - TODO' });
  },

  // Get user's attending events (registered or ticketed)
  getAttendingEvents: async (req, res, next) => {
    try {
      const now = new Date();

      // Get free event registrations
      const registrations = await prisma.eventRegistration.findMany({
        where: {
          userId: req.user.id,
          status: 'confirmed',
          event: {
            startDate: {
              gte: now,
            },
            status: 'upcoming',
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
        orderBy: {
          event: {
            startDate: 'asc',
          },
        },
      });

      // Get paid event tickets
      const tickets = await prisma.ticket.findMany({
        where: {
          userId: req.user.id,
          status: 'confirmed',
          event: {
            startDate: {
              gte: now,
            },
            status: 'upcoming',
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
        orderBy: {
          event: {
            startDate: 'asc',
          },
        },
      });

      // Combine and format
      const attendingEvents = [
        ...registrations.map((r) => r.event),
        ...tickets.map((t) => t.event),
      ];

      res.json({
        success: true,
        data: attendingEvents,
      });
    } catch (error) {
      console.error('Get attending events error:', error);
      next(error);
    }
  },

  // Get user's hosted events
  getHostedEvents: async (req, res, next) => {
    try {
      const now = new Date();

      const hostedEvents = await prisma.event.findMany({
        where: {
          organizerId: req.user.id,
          startDate: {
            gte: now,
          },
          status: {
            in: ['pending', 'upcoming', 'ongoing'],
          },
        },
        include: {
          _count: {
            select: {
              registrations: true,
              tickets: true,
            },
          },
        },
        orderBy: [
          {
            status: 'asc', // pending first
          },
          {
            startDate: 'asc',
          },
        ],
      });

      res.json({
        success: true,
        data: hostedEvents,
      });
    } catch (error) {
      console.error('Get hosted events error:', error);
      next(error);
    }
  },

  // Get user's past events
  getPastEvents: async (req, res, next) => {
    try {
      const now = new Date();

      // Get past event registrations
      const pastRegistrations = await prisma.eventRegistration.findMany({
        where: {
          userId: req.user.id,
          event: {
            startDate: {
              lt: now,
            },
          },
        },
        include: {
          event: {
            include: {
              _count: {
                select: {
                  registrations: true,
                  tickets: true,
                },
              },
            },
          },
        },
        orderBy: {
          event: {
            startDate: 'desc',
          },
        },
      });

      // Get past event tickets
      const pastTickets = await prisma.ticket.findMany({
        where: {
          userId: req.user.id,
          event: {
            startDate: {
              lt: now,
            },
          },
        },
        include: {
          event: {
            include: {
              _count: {
                select: {
                  registrations: true,
                  tickets: true,
                },
              },
            },
          },
        },
        orderBy: {
          event: {
            startDate: 'desc',
          },
        },
      });

      // Combine and format
      const pastEvents = [
        ...pastRegistrations.map((r) => r.event),
        ...pastTickets.map((t) => t.event),
      ];

      res.json({
        success: true,
        data: pastEvents,
      });
    } catch (error) {
      console.error('Get past events error:', error);
      next(error);
    }
  },

  toggleLike: async (req, res, next) => {
    // Similar to listing like
    res.json({ success: true, message: 'Toggle event like - TODO' });
  },
};

module.exports = eventController;
