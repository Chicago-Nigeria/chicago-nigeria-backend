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
    try {
      const { id } = req.params;

      const event = await prisma.event.findUnique({
        where: { id },
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
      console.error('Get event by ID error:', error);
      next(error);
    }
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

  // ==================== ORGANIZER EVENT MANAGEMENT ====================

  /**
   * Get organizer's event with full details including attendees
   * Only accessible by the event organizer
   */
  getOrganizerEventDetails: async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const event = await prisma.event.findUnique({
        where: { id },
        include: {
          organizer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              photo: true,
            },
          },
          // Free event registrations
          registrations: {
            orderBy: { registeredAt: 'desc' },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              status: true,
              registeredAt: true,
            },
          },
          // Paid event tickets
          tickets: {
            orderBy: { purchasedAt: 'desc' },
            select: {
              id: true,
              ticketCode: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              quantity: true,
              unitPrice: true,
              totalPrice: true,
              platformFee: true,
              processingFee: true,
              status: true,
              purchasedAt: true,
              usedAt: true,
            },
          },
          _count: {
            select: {
              registrations: true,
              tickets: true,
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

      // Verify user is the organizer
      if (event.organizerId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to view this event\'s details',
        });
      }

      // Calculate earnings summary for paid events
      let earningsSummary = null;
      if (!event.isFree && event.tickets.length > 0) {
        const totalRevenue = event.tickets
          .filter(t => t.status === 'confirmed')
          .reduce((sum, t) => sum + (t.unitPrice * t.quantity), 0);
        const totalPlatformFees = event.tickets
          .filter(t => t.status === 'confirmed')
          .reduce((sum, t) => sum + t.platformFee, 0);

        earningsSummary = {
          totalRevenue,
          platformFees: totalPlatformFees,
          netEarnings: totalRevenue - totalPlatformFees,
          ticketsSold: event.tickets.filter(t => t.status === 'confirmed').length,
        };
      }

      res.json({
        success: true,
        data: {
          ...event,
          earningsSummary,
        },
      });
    } catch (error) {
      console.error('Get organizer event details error:', error);
      next(error);
    }
  },

  /**
   * Export event attendees as CSV
   * Only accessible by the event organizer
   */
  exportAttendeesCSV: async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const event = await prisma.event.findUnique({
        where: { id },
        include: {
          registrations: {
            orderBy: { registeredAt: 'desc' },
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              status: true,
              registeredAt: true,
            },
          },
          tickets: {
            orderBy: { purchasedAt: 'desc' },
            select: {
              ticketCode: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              quantity: true,
              unitPrice: true,
              totalPrice: true,
              status: true,
              purchasedAt: true,
              usedAt: true,
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

      // Verify user is the organizer
      if (event.organizerId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to export this event\'s attendees',
        });
      }

      // Build CSV content
      let csvContent = '';

      if (event.isFree) {
        // Free event - registrations
        csvContent = 'First Name,Last Name,Email,Phone,Status,Registered At\n';
        event.registrations.forEach(reg => {
          csvContent += `"${reg.firstName || ''}","${reg.lastName || ''}","${reg.email || ''}","${reg.phone || ''}","${reg.status}","${reg.registeredAt.toISOString()}"\n`;
        });
      } else {
        // Paid event - tickets
        csvContent = 'Ticket Code,First Name,Last Name,Email,Phone,Quantity,Unit Price,Total Price,Status,Purchased At,Used At\n';
        event.tickets.forEach(ticket => {
          csvContent += `"${ticket.ticketCode || ''}","${ticket.firstName || ''}","${ticket.lastName || ''}","${ticket.email || ''}","${ticket.phone || ''}",${ticket.quantity},$${ticket.unitPrice.toFixed(2)},$${ticket.totalPrice.toFixed(2)},"${ticket.status}","${ticket.purchasedAt.toISOString()}","${ticket.usedAt ? ticket.usedAt.toISOString() : ''}"\n`;
        });
      }

      // Set headers for CSV download
      const filename = `${event.title.replace(/[^a-z0-9]/gi, '_')}_attendees_${new Date().toISOString().split('T')[0]}.csv`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);
    } catch (error) {
      console.error('Export attendees CSV error:', error);
      next(error);
    }
  },

  /**
   * Get all organizer's events with summary info
   */
  getAllOrganizerEvents: async (req, res, next) => {
    try {
      const userId = req.user.id;

      const events = await prisma.event.findMany({
        where: {
          organizerId: userId,
        },
        include: {
          _count: {
            select: {
              registrations: true,
              tickets: true,
            },
          },
        },
        orderBy: { startDate: 'desc' },
      });

      // Add earnings info for paid events
      const eventsWithEarnings = await Promise.all(
        events.map(async (event) => {
          if (event.isFree) {
            return {
              ...event,
              totalAttendees: event._count.registrations,
              earnings: null,
            };
          }

          // Get ticket earnings for paid events
          const ticketAggregation = await prisma.ticket.aggregate({
            where: {
              eventId: event.id,
              status: 'confirmed',
            },
            _sum: {
              unitPrice: true,
              platformFee: true,
            },
            _count: true,
          });

          const totalRevenue = ticketAggregation._sum.unitPrice || 0;
          const platformFees = ticketAggregation._sum.platformFee || 0;

          return {
            ...event,
            totalAttendees: event._count.tickets,
            earnings: {
              totalRevenue,
              platformFees,
              netEarnings: totalRevenue - platformFees,
            },
          };
        })
      );

      res.json({
        success: true,
        data: eventsWithEarnings,
      });
    } catch (error) {
      console.error('Get all organizer events error:', error);
      next(error);
    }
  },
};

module.exports = eventController;
