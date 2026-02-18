const prisma = require('../config/prisma');
const { stripe } = require('../config/stripe');
const { v4: uuidv4 } = require('uuid');

const webhookController = {
  /**
   * Handle Stripe webhooks
   * IMPORTANT: This endpoint must receive raw body (not parsed JSON)
   */
  handleStripeWebhook: async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      // Verify webhook signature
      event = stripe.webhooks.constructEvent(
        req.body, // Must be raw body
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    try {
      console.log(`Processing webhook event: ${event.type}`);

      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutSessionCompleted(event.data.object);
          break;

        case 'customer.subscription.updated':
          await handleCustomerSubscriptionUpdated(event.data.object);
          break;

        case 'customer.subscription.deleted':
          await handleCustomerSubscriptionDeleted(event.data.object);
          break;

        case 'payment_intent.succeeded':
          await handlePaymentSuccess(event.data.object);
          break;

        case 'payment_intent.payment_failed':
          await handlePaymentFailed(event.data.object);
          break;

        case 'account.updated':
          await handleAccountUpdated(event.data.object);
          break;

        case 'transfer.created':
          await handleTransferCreated(event.data.object);
          break;

        case 'charge.refunded':
          await handleChargeRefunded(event.data.object);
          break;

        case 'charge.succeeded':
          // Charge succeeded is handled via payment_intent.succeeded
          console.log('Charge succeeded (handled via payment_intent)');
          break;

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Webhook handler error:', error);
      // Still return 200 to prevent Stripe from retrying
      res.json({ received: true, error: error.message });
    }
  },
};

/**
 * Handle successful payment
 */
async function handlePaymentSuccess(paymentIntent) {
  console.log('Payment succeeded:', paymentIntent.id);

  const payment = await prisma.payment.findUnique({
    where: { stripePaymentIntentId: paymentIntent.id },
  });

  if (!payment) {
    console.log('Payment record not found for:', paymentIntent.id);
    return;
  }

  if (payment.status === 'succeeded') {
    console.log('Payment already processed:', paymentIntent.id);
    return;
  }

  // Get event
  const event = await prisma.event.findUnique({
    where: { id: payment.eventId },
  });

  const metadata = payment.metadata;
  const quantity = metadata.quantity || 1;

  // Create tickets
  for (let i = 0; i < quantity; i++) {
    await prisma.ticket.create({
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
    const stripeAccount = await prisma.stripeAccount.findFirst({
      where: { stripeAccountId: payment.organizerStripeAccountId },
    });
    stripeAccountDbId = stripeAccount?.id || null;
  }

  // Always create payout record (manual or automatic)
  await prisma.payout.create({
    data: {
      stripeAccountId: stripeAccountDbId, // null if organizer hasn't connected Stripe
      userId: event.organizerId,
      paymentId: payment.id,
      eventId: payment.eventId,
      amount: payment.organizerAmount,
      status: 'pending',
      payoutMethod: hasStripe && stripeAccountDbId ? 'stripe' : 'manual',
      scheduledFor: event.endDate || event.startDate,
    },
  });

  // Send confirmation email (TODO: implement email service)
  console.log('Tickets created for payment:', payment.id);
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(paymentIntent) {
  console.log('Payment failed:', paymentIntent.id);

  await prisma.payment.updateMany({
    where: { stripePaymentIntentId: paymentIntent.id },
    data: {
      status: 'failed',
      failureReason: paymentIntent.last_payment_error?.message || 'Payment failed',
    },
  });
}

/**
 * Handle Stripe Connect account updates
 * When an organizer completes Stripe onboarding, migrate their pending manual payouts to Stripe
 */
async function handleAccountUpdated(account) {
  console.log('Account updated:', account.id);

  // Update the Stripe account record
  await prisma.stripeAccount.updateMany({
    where: { stripeAccountId: account.id },
    data: {
      isOnboardingComplete: account.details_submitted,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      businessName: account.business_profile?.name || null,
      businessType: account.business_type || null,
    },
  });

  // If account is now fully enabled, migrate pending manual payouts to Stripe
  if (account.charges_enabled && account.payouts_enabled) {
    // Find the StripeAccount record to get the user and internal ID
    const stripeAccount = await prisma.stripeAccount.findUnique({
      where: { stripeAccountId: account.id },
    });

    if (stripeAccount) {
      // Update all pending manual payouts for this organizer to use Stripe
      const updatedPayouts = await prisma.payout.updateMany({
        where: {
          userId: stripeAccount.userId,
          payoutMethod: 'manual',
          status: 'pending',
        },
        data: {
          payoutMethod: 'stripe',
          stripeAccountId: stripeAccount.id,
        },
      });

      if (updatedPayouts.count > 0) {
        console.log(`Migrated ${updatedPayouts.count} pending manual payouts to Stripe for user ${stripeAccount.userId}`);
      }

      // Also update any Payment records that were created before Stripe was connected
      await prisma.payment.updateMany({
        where: {
          organizerStripeAccountId: null,
          status: 'succeeded',
          event: {
            organizerId: stripeAccount.userId,
          },
        },
        data: {
          organizerStripeAccountId: account.id,
        },
      });
    }
  }
}

/**
 * Handle transfer created (payout to organizer)
 */
async function handleTransferCreated(transfer) {
  console.log('Transfer created:', transfer.id);

  if (transfer.metadata?.payoutId) {
    await prisma.payout.update({
      where: { id: transfer.metadata.payoutId },
      data: {
        status: 'paid',
        stripeTransferId: transfer.id,
        processedAt: new Date(),
      },
    });
  }
}

/**
 * Handle charge refunded
 */
async function handleChargeRefunded(charge) {
  console.log('Charge refunded:', charge.id);

  // Update payment status
  const payment = await prisma.payment.findFirst({
    where: { stripeChargeId: charge.id },
  });

  if (payment) {
    const refundedAmount = charge.amount_refunded;
    const isFullRefund = refundedAmount >= charge.amount;

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: isFullRefund ? 'refunded' : 'partially_refunded',
      },
    });

    // Cancel pending payouts
    if (isFullRefund) {
      await prisma.payout.updateMany({
        where: {
          paymentId: payment.id,
          status: 'pending',
        },
        data: {
          status: 'cancelled',
        },
      });
    }
  }
}

/**
 * Handle completed checkout for monthly social media subscription.
 * This is the authoritative source to create/update local subscription records.
 */
async function handleCheckoutSessionCompleted(session) {
  if (session.mode !== 'subscription') return;
  if (!session.subscription) return;

  const metadata = session.metadata || {};
  if (!metadata.userId) {
    console.log('Subscription checkout missing userId metadata:', session.id);
    return;
  }

  const stripeSubscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription.id;

  const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const currentPeriodStart = stripeSub.current_period_start
    ? new Date(stripeSub.current_period_start * 1000)
    : new Date();
  const currentPeriodEnd = stripeSub.current_period_end
    ? new Date(stripeSub.current_period_end * 1000)
    : new Date();

  let socialHandles = {};
  try {
    socialHandles = JSON.parse(metadata.socialHandles || '{}');
  } catch (error) {
    console.error('Invalid social handles metadata JSON:', error);
  }

  await prisma.socialSubscription.upsert({
    where: { userId: metadata.userId },
    update: {
      status: stripeSub.status,
      stripeSubscriptionId: stripeSub.id,
      stripeCustomerId: typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer?.id,
      stripePriceId: stripeSub.items?.data?.[0]?.price?.id || null,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end || false,
      cancelledAt: stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000) : null,
      businessName: metadata.businessName || 'Business',
      businessType: metadata.businessType || 'Other',
      socialHandles,
      contactEmail: metadata.contactEmail || '',
      contactPhone: metadata.contactPhone || '',
      description: metadata.description || null,
    },
    create: {
      userId: metadata.userId,
      status: stripeSub.status,
      stripeSubscriptionId: stripeSub.id,
      stripeCustomerId: typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer?.id,
      stripePriceId: stripeSub.items?.data?.[0]?.price?.id || null,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end || false,
      cancelledAt: stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000) : null,
      businessName: metadata.businessName || 'Business',
      businessType: metadata.businessType || 'Other',
      socialHandles,
      contactEmail: metadata.contactEmail || '',
      contactPhone: metadata.contactPhone || '',
      description: metadata.description || null,
    },
  });

  console.log('Social subscription synced from checkout:', stripeSub.id);
}

/**
 * Keep subscription status in sync when Stripe updates billing lifecycle.
 */
async function handleCustomerSubscriptionUpdated(stripeSub) {
  await prisma.socialSubscription.updateMany({
    where: { stripeSubscriptionId: stripeSub.id },
    data: {
      status: stripeSub.status,
      currentPeriodStart: stripeSub.current_period_start
        ? new Date(stripeSub.current_period_start * 1000)
        : undefined,
      currentPeriodEnd: stripeSub.current_period_end
        ? new Date(stripeSub.current_period_end * 1000)
        : undefined,
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end || false,
      cancelledAt: stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000) : null,
      stripePriceId: stripeSub.items?.data?.[0]?.price?.id || null,
    },
  });
}

/**
 * Mark subscriptions cancelled when Stripe deletes them.
 */
async function handleCustomerSubscriptionDeleted(stripeSub) {
  await prisma.socialSubscription.updateMany({
    where: { stripeSubscriptionId: stripeSub.id },
    data: {
      status: stripeSub.status || 'canceled',
      cancelAtPeriodEnd: true,
      cancelledAt: stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000) : new Date(),
      currentPeriodEnd: stripeSub.current_period_end
        ? new Date(stripeSub.current_period_end * 1000)
        : undefined,
    },
  });
}

module.exports = webhookController;
