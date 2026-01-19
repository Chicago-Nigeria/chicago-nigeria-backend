const prisma = require('../config/prisma');
const {
  stripe,
  PLATFORM_FEE_PER_TICKET,
  calculateStripeFee,
  calculateBuyerTotal,
  calculateOrganizerPayout,
} = require('../config/stripe');
const { v4: uuidv4 } = require('uuid');

const paymentController = {
  // ==================== ORGANIZER ONBOARDING ====================

  /**
   * Create a Stripe Connect account for an organizer
   * Returns an onboarding link for the organizer to complete
   */
  createConnectAccount: async (req, res, next) => {
    try {
      const userId = req.user.id;

      // Check if user already has a Stripe account
      const existingAccount = await prisma.stripeAccount.findUnique({
        where: { userId },
      });

      if (existingAccount) {
        // If account exists but onboarding not complete, generate new link
        if (!existingAccount.isOnboardingComplete) {
          const accountLink = await stripe.accountLinks.create({
            account: existingAccount.stripeAccountId,
            refresh_url: `${process.env.FRONTEND_URL}/settings/payments?refresh=true`,
            return_url: `${process.env.FRONTEND_URL}/settings/payments?success=true`,
            type: 'account_onboarding',
          });

          return res.json({
            success: true,
            message: 'Continue onboarding',
            data: {
              onboardingUrl: accountLink.url,
              accountId: existingAccount.stripeAccountId,
            },
          });
        }

        return res.status(400).json({
          success: false,
          message: 'You already have a connected Stripe account',
        });
      }

      // Get user info for pre-filling
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      // Create Express Connect account
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'individual',
        business_profile: {
          mcc: '7941', // Sports Clubs/Fields
          product_description: 'Event tickets for community events',
        },
        metadata: {
          userId: userId,
          platform: 'chicago-nigeria',
        },
      });

      // Save account to database
      await prisma.stripeAccount.create({
        data: {
          userId,
          stripeAccountId: account.id,
          stripeAccountType: 'express',
          isOnboardingComplete: false,
          chargesEnabled: false,
          payoutsEnabled: false,
        },
      });

      // Create account onboarding link
      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${process.env.FRONTEND_URL}/settings/payments?refresh=true`,
        return_url: `${process.env.FRONTEND_URL}/settings/payments?success=true`,
        type: 'account_onboarding',
      });

      res.json({
        success: true,
        message: 'Stripe account created. Complete onboarding to receive payouts.',
        data: {
          onboardingUrl: accountLink.url,
          accountId: account.id,
        },
      });
    } catch (error) {
      console.error('Create Connect account error:', error);
      next(error);
    }
  },

  /**
   * Get the organizer's Stripe account status
   */
  getAccountStatus: async (req, res, next) => {
    try {
      const userId = req.user.id;

      const stripeAccount = await prisma.stripeAccount.findUnique({
        where: { userId },
      });

      if (!stripeAccount) {
        return res.json({
          success: true,
          data: {
            hasAccount: false,
            isOnboardingComplete: false,
            chargesEnabled: false,
            payoutsEnabled: false,
          },
        });
      }

      // Fetch latest status from Stripe
      const account = await stripe.accounts.retrieve(stripeAccount.stripeAccountId);

      // Update local database with latest status
      const updatedAccount = await prisma.stripeAccount.update({
        where: { userId },
        data: {
          isOnboardingComplete: account.details_submitted,
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled,
          businessName: account.business_profile?.name || null,
          businessType: account.business_type || null,
        },
      });

      res.json({
        success: true,
        data: {
          hasAccount: true,
          accountId: stripeAccount.stripeAccountId,
          isOnboardingComplete: updatedAccount.isOnboardingComplete,
          chargesEnabled: updatedAccount.chargesEnabled,
          payoutsEnabled: updatedAccount.payoutsEnabled,
          businessName: updatedAccount.businessName,
        },
      });
    } catch (error) {
      console.error('Get account status error:', error);
      next(error);
    }
  },

  /**
   * Generate a new onboarding link (if refresh needed)
   */
  refreshOnboardingLink: async (req, res, next) => {
    try {
      const userId = req.user.id;

      const stripeAccount = await prisma.stripeAccount.findUnique({
        where: { userId },
      });

      if (!stripeAccount) {
        return res.status(404).json({
          success: false,
          message: 'No Stripe account found. Please create one first.',
        });
      }

      const accountLink = await stripe.accountLinks.create({
        account: stripeAccount.stripeAccountId,
        refresh_url: `${process.env.FRONTEND_URL}/settings/payments?refresh=true`,
        return_url: `${process.env.FRONTEND_URL}/settings/payments?success=true`,
        type: 'account_onboarding',
      });

      res.json({
        success: true,
        data: {
          onboardingUrl: accountLink.url,
        },
      });
    } catch (error) {
      console.error('Refresh onboarding link error:', error);
      next(error);
    }
  },

  /**
   * Create Stripe dashboard login link for organizer
   */
  createDashboardLink: async (req, res, next) => {
    try {
      const userId = req.user.id;

      const stripeAccount = await prisma.stripeAccount.findUnique({
        where: { userId },
      });

      if (!stripeAccount) {
        return res.status(404).json({
          success: false,
          message: 'No Stripe account found',
        });
      }

      const loginLink = await stripe.accounts.createLoginLink(
        stripeAccount.stripeAccountId
      );

      res.json({
        success: true,
        data: {
          dashboardUrl: loginLink.url,
        },
      });
    } catch (error) {
      console.error('Create dashboard link error:', error);
      next(error);
    }
  },

  // ==================== TICKET PURCHASE ====================

  /**
   * Create a payment intent for ticket purchase
   * Supports events with or without organizer Stripe accounts
   */
  createPaymentIntent: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const { eventId, quantity, firstName, lastName, email, phone } = req.body;

      // Validate quantity
      if (!quantity || quantity < 1) {
        return res.status(400).json({
          success: false,
          message: 'Quantity must be at least 1',
        });
      }

      // Get event with organizer's Stripe account
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: {
          organizer: {
            include: {
              stripeAccount: true,
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

      if (event.isFree) {
        return res.status(400).json({
          success: false,
          message: 'This is a free event. Use the registration endpoint instead.',
        });
      }

      // Check ticket availability
      if (event.availableTickets !== null && event.availableTickets < quantity) {
        return res.status(400).json({
          success: false,
          message: `Only ${event.availableTickets} tickets available`,
        });
      }

      // Check if organizer has connected Stripe
      const hasStripe = event.organizer.stripeAccount?.chargesEnabled;

      // Calculate amounts (in cents)
      const ticketPriceInCents = Math.round(event.ticketPrice * 100);
      const buyerTotal = calculateBuyerTotal(ticketPriceInCents, quantity);
      const organizerPayout = calculateOrganizerPayout(ticketPriceInCents, quantity);

      // Create payment record
      const payment = await prisma.payment.create({
        data: {
          stripePaymentIntentId: `pending_${uuidv4()}`, // Temporary, will be updated
          userId,
          eventId,
          subtotal: buyerTotal.subtotal,
          platformFee: organizerPayout.platformFee,
          processingFee: buyerTotal.processingFee,
          totalAmount: buyerTotal.total,
          organizerAmount: organizerPayout.payout,
          // Only set Stripe account ID if organizer has connected
          organizerStripeAccountId: hasStripe ? event.organizer.stripeAccount.stripeAccountId : null,
          status: 'pending',
          metadata: {
            quantity,
            firstName,
            lastName,
            email,
            phone,
            eventTitle: event.title,
            organizerId: event.organizerId,
            organizerHasStripe: hasStripe,
          },
        },
      });

      // Create Stripe Payment Intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: buyerTotal.total,
        currency: 'usd',
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          paymentId: payment.id,
          eventId,
          userId,
          quantity: quantity.toString(),
          organizerHasStripe: hasStripe ? 'true' : 'false',
        },
        // Don't use transfer_data - we'll transfer manually after event
        // This keeps funds in platform account until event ends
      });

      // Update payment with actual Stripe payment intent ID
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          stripePaymentIntentId: paymentIntent.id,
        },
      });

      res.json({
        success: true,
        data: {
          clientSecret: paymentIntent.client_secret,
          paymentId: payment.id,
          breakdown: {
            ticketPrice: event.ticketPrice,
            quantity,
            subtotal: buyerTotal.subtotal / 100,
            processingFee: buyerTotal.processingFee / 100,
            total: buyerTotal.total / 100,
          },
          // Let frontend know if organizer has Stripe (for display purposes)
          organizerHasStripe: hasStripe,
        },
      });
    } catch (error) {
      console.error('Create payment intent error:', error);
      next(error);
    }
  },

  /**
   * Confirm payment and create tickets (called after successful payment)
   */
  confirmPayment: async (req, res, next) => {
    try {
      const { paymentIntentId } = req.body;

      // Verify payment with Stripe
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      if (paymentIntent.status !== 'succeeded') {
        return res.status(400).json({
          success: false,
          message: 'Payment has not been completed',
        });
      }

      // Get payment record
      const payment = await prisma.payment.findUnique({
        where: { stripePaymentIntentId: paymentIntentId },
      });

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment record not found',
        });
      }

      if (payment.status === 'succeeded') {
        // Already processed
        const tickets = await prisma.ticket.findMany({
          where: { paymentId: payment.id },
        });

        return res.json({
          success: true,
          message: 'Payment already confirmed',
          data: { tickets },
        });
      }

      // Get event
      const event = await prisma.event.findUnique({
        where: { id: payment.eventId },
      });

      const metadata = payment.metadata;
      const quantity = metadata.quantity || 1;

      // Create tickets
      const tickets = [];
      for (let i = 0; i < quantity; i++) {
        const ticket = await prisma.ticket.create({
          data: {
            ticketCode: `TKT-${uuidv4().slice(0, 8).toUpperCase()}`,
            eventId: payment.eventId,
            userId: payment.userId,
            firstName: metadata.firstName,
            lastName: metadata.lastName,
            email: metadata.email,
            phone: metadata.phone,
            quantity: 1,
            unitPrice: payment.subtotal / quantity / 100,
            totalPrice: payment.totalAmount / quantity / 100,
            platformFee: payment.platformFee / quantity / 100,
            processingFee: payment.processingFee / quantity / 100,
            status: 'confirmed',
            paymentId: payment.id,
          },
        });
        tickets.push(ticket);
      }

      // Update payment status
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'succeeded',
          stripeChargeId: paymentIntent.latest_charge,
        },
      });

      // Update available tickets
      if (event.availableTickets !== null) {
        await prisma.event.update({
          where: { id: payment.eventId },
          data: {
            availableTickets: {
              decrement: quantity,
            },
          },
        });
      }

      // Create payout record (scheduled for after event ends)
      // Check if organizer has Stripe connected
      const hasStripe = payment.organizerStripeAccountId !== null;

      let stripeAccountDbId = null;
      if (hasStripe) {
        // Look up the StripeAccount's internal ID from the Stripe account ID
        const stripeAccount = await prisma.stripeAccount.findUnique({
          where: { stripeAccountId: payment.organizerStripeAccountId },
        });
        stripeAccountDbId = stripeAccount?.id || null;
      }

      await prisma.payout.create({
        data: {
          stripeAccountId: stripeAccountDbId, // null if organizer hasn't connected Stripe
          userId: event.organizerId,
          paymentId: payment.id,
          eventId: payment.eventId,
          amount: payment.organizerAmount,
          status: 'pending',
          payoutMethod: hasStripe ? 'stripe' : 'manual', // Track payout method
          scheduledFor: event.endDate || event.startDate,
        },
      });

      res.json({
        success: true,
        message: 'Payment confirmed. Tickets created.',
        data: { tickets },
      });
    } catch (error) {
      console.error('Confirm payment error:', error);
      next(error);
    }
  },

  // ==================== PAYOUTS ====================

  /**
   * Process pending payouts (called by cron job or admin)
   * Only processes Stripe payouts for events that have ended
   * Manual payouts must be processed separately by admin
   */
  processPendingPayouts: async (req, res, next) => {
    try {
      const now = new Date();

      // Find pending STRIPE payouts for events that have ended
      // Skip manual payouts - those must be handled by admin
      const pendingPayouts = await prisma.payout.findMany({
        where: {
          status: 'pending',
          payoutMethod: 'stripe', // Only process automatic Stripe payouts
          stripeAccountId: { not: null }, // Must have a connected account
          scheduledFor: {
            lte: now,
          },
        },
        include: {
          stripeAccount: true,
          payment: true,
        },
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

          results.push({
            payoutId: payout.id,
            status: 'success',
            transferId: transfer.id,
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

      res.json({
        success: true,
        message: `Processed ${results.length} payouts`,
        data: results,
      });
    } catch (error) {
      console.error('Process payouts error:', error);
      next(error);
    }
  },

  /**
   * Get organizer's earnings summary
   */
  getEarningsSummary: async (req, res, next) => {
    try {
      const userId = req.user.id;

      // Get all payouts for this organizer
      const payouts = await prisma.payout.findMany({
        where: { userId },
        include: {
          payment: true,
        },
      });

      const summary = {
        totalEarnings: 0,
        pendingPayouts: 0,
        completedPayouts: 0,
        payoutHistory: [],
      };

      for (const payout of payouts) {
        const amountInDollars = payout.amount / 100;

        if (payout.status === 'paid') {
          summary.completedPayouts += amountInDollars;
        } else if (payout.status === 'pending') {
          summary.pendingPayouts += amountInDollars;
        }

        summary.totalEarnings += amountInDollars;
        summary.payoutHistory.push({
          id: payout.id,
          eventId: payout.eventId,
          amount: amountInDollars,
          status: payout.status,
          payoutMethod: payout.payoutMethod || 'stripe', // Include payout method
          scheduledFor: payout.scheduledFor,
          processedAt: payout.processedAt,
        });
      }

      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      console.error('Get earnings summary error:', error);
      next(error);
    }
  },

  // ==================== REFUNDS ====================

  /**
   * Request a refund for a ticket
   */
  requestRefund: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const { ticketId } = req.params;

      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        include: {
          payment: true,
          event: true,
        },
      });

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: 'Ticket not found',
        });
      }

      if (ticket.userId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'You can only refund your own tickets',
        });
      }

      if (ticket.status === 'refunded') {
        return res.status(400).json({
          success: false,
          message: 'Ticket has already been refunded',
        });
      }

      if (ticket.status === 'used') {
        return res.status(400).json({
          success: false,
          message: 'Cannot refund a used ticket',
        });
      }

      // Check if event has already started
      if (new Date(ticket.event.startDate) <= new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Cannot refund after event has started',
        });
      }

      // Process refund through Stripe
      const refund = await stripe.refunds.create({
        payment_intent: ticket.payment.stripePaymentIntentId,
        amount: Math.round(ticket.totalPrice * 100), // Refund full amount including processing fee
      });

      // Update ticket status
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { status: 'refunded' },
      });

      // Update available tickets
      if (ticket.event.availableTickets !== null) {
        await prisma.event.update({
          where: { id: ticket.eventId },
          data: {
            availableTickets: {
              increment: 1,
            },
          },
        });
      }

      // Cancel the payout if not yet processed
      await prisma.payout.updateMany({
        where: {
          paymentId: ticket.paymentId,
          status: 'pending',
        },
        data: {
          status: 'cancelled',
        },
      });

      res.json({
        success: true,
        message: 'Refund processed successfully',
        data: {
          refundId: refund.id,
          amount: refund.amount / 100,
        },
      });
    } catch (error) {
      console.error('Request refund error:', error);
      next(error);
    }
  },

  // ==================== PRICE CALCULATOR ====================

  /**
   * Calculate ticket price breakdown (for display before purchase)
   */
  calculatePrice: async (req, res, next) => {
    try {
      const { eventId, quantity = 1 } = req.query;

      const event = await prisma.event.findUnique({
        where: { id: eventId },
      });

      if (!event) {
        return res.status(404).json({
          success: false,
          message: 'Event not found',
        });
      }

      if (event.isFree) {
        return res.json({
          success: true,
          data: {
            isFree: true,
            ticketPrice: 0,
            quantity: parseInt(quantity),
            subtotal: 0,
            processingFee: 0,
            total: 0,
          },
        });
      }

      const ticketPriceInCents = Math.round(event.ticketPrice * 100);
      const buyerTotal = calculateBuyerTotal(ticketPriceInCents, parseInt(quantity));

      res.json({
        success: true,
        data: {
          isFree: false,
          ticketPrice: event.ticketPrice,
          quantity: parseInt(quantity),
          subtotal: buyerTotal.subtotal / 100,
          processingFee: buyerTotal.processingFee / 100,
          total: buyerTotal.total / 100,
        },
      });
    } catch (error) {
      console.error('Calculate price error:', error);
      next(error);
    }
  },
};

module.exports = paymentController;
