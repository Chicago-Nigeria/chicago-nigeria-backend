const prisma = require('../config/prisma');
const { stripe } = require('../config/stripe');

const PRICE_AMOUNT = 6500; // $65.00 in cents
const PRODUCT_NAME = 'Social Media Management Subscription';
const PRICE_ID = process.env.STRIPE_SOCIAL_SUBSCRIPTION_PRICE_ID;

const buildSubscriptionLineItems = () => {
    if (PRICE_ID) {
        return [{ price: PRICE_ID, quantity: 1 }];
    }

    return [
        {
            price_data: {
                currency: 'usd',
                product_data: {
                    name: PRODUCT_NAME,
                    description: 'Monthly Social Media Management Service'
                },
                unit_amount: PRICE_AMOUNT,
                recurring: {
                    interval: 'month'
                }
            },
            quantity: 1,
        },
    ];
};

const normalizeSubscriptionStatus = (subscription) => {
    if (!subscription) return null;

    const status = subscription.status;
    const now = new Date();
    const periodEnd = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;

    if ((status === 'active' || status === 'trialing') && subscription.cancelAtPeriodEnd) {
        return 'cancels_soon';
    }

    if (status === 'active' || status === 'trialing') {
        return 'active';
    }

    if (status === 'past_due' || status === 'unpaid' || status === 'incomplete') {
        return 'past_due';
    }

    if (status === 'canceled' || status === 'cancelled' || status === 'incomplete_expired') {
        if (periodEnd && periodEnd < now) return 'expired';
        return 'cancelled';
    }

    if (periodEnd && periodEnd < now) {
        return 'expired';
    }

    return status || 'unknown';
};

const withUiStatus = (subscription) => {
    if (!subscription) return null;
    return {
        ...subscription,
        uiStatus: normalizeSubscriptionStatus(subscription),
    };
};

const subscriptionController = {
    /**
     * Create a Stripe Checkout Session for subscription
     */
    createSubscriptionSession: async (req, res, next) => {
        try {
            const userId = req.user.id;
            const {
                businessName,
                businessType,
                hasExistingAccounts,
                instagramHandle,
                facebookHandle,
                tiktokHandle,
                twitterHandle,
                linkedinHandle,
                email,
                phone,
                description
            } = req.body;

            if (!businessName || !businessType || !email || !phone || !description) {
                return res.status(400).json({ message: 'Missing required subscription details' });
            }

            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user) return res.status(404).json({ message: 'User not found' });

            // Check for existing active subscription
            const existingSub = await prisma.socialSubscription.findUnique({
                where: { userId }
            });

            if (existingSub && (existingSub.status === 'active' || existingSub.status === 'trialing')) {
                return res.status(400).json({ message: 'You already have an active subscription' });
            }

            // Prepare metadata
            const socialHandles = {
                hasExistingAccounts,
                instagram: instagramHandle,
                facebook: facebookHandle,
                tiktok: tiktokHandle,
                twitter: twitterHandle,
                linkedin: linkedinHandle
            };

            // Create Stripe Checkout Session
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                mode: 'subscription',
                customer_email: user.email,
                line_items: buildSubscriptionLineItems(),
                metadata: {
                    userId,
                    businessName,
                    businessType,
                    socialHandles: JSON.stringify(socialHandles),
                    contactEmail: email,
                    contactPhone: phone,
                    description: description ? description.substring(0, 500) : '' // Limit length for Stripe metadata
                },
                success_url: `${process.env.FRONTEND_URL}/settings?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.FRONTEND_URL}/social-media-subscription?cancelled=true`,
            });

            res.json({
                success: true,
                sessionId: session.id,
                url: session.url
            });

        } catch (error) {
            console.error('Create subscription session error:', error);
            next(error);
        }
    },

    /**
     * Verify subscription from checkout session.
     * Used as a fast post-checkout sync path; webhook remains the source of truth.
     */
    verifySubscription: async (req, res, next) => {
        try {
            const { sessionId } = req.body;
            const userId = req.user.id;

            const session = await stripe.checkout.sessions.retrieve(sessionId);

            if (!session || session.payment_status !== 'paid') {
                return res.status(400).json({ message: 'Payment not completed' });
            }

            // Metadata extraction
            const metadata = session.metadata || {};
            if (metadata.userId !== userId) {
                return res.status(403).json({ message: 'Unauthorized verification' });
            }

            const subscriptionId = session.subscription;
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);

            // Upsert subscription in DB
            const localSub = await prisma.socialSubscription.upsert({
                where: { userId },
                update: {
                    status: subscription.status,
                    stripeSubscriptionId: subscription.id,
                    stripeCustomerId: session.customer,
                    stripePriceId: subscription.items?.data?.[0]?.price?.id || null,
                    currentPeriodStart: new Date(subscription.current_period_start * 1000),
                    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
                    cancelAtPeriodEnd: subscription.cancel_at_period_end,
                    cancelledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
                    businessName: metadata.businessName,
                    businessType: metadata.businessType,
                    socialHandles: JSON.parse(metadata.socialHandles || '{}'),
                    contactEmail: metadata.contactEmail,
                    contactPhone: metadata.contactPhone,
                    description: metadata.description
                },
                create: {
                    userId,
                    status: subscription.status,
                    stripeSubscriptionId: subscription.id,
                    stripeCustomerId: session.customer,
                    stripePriceId: subscription.items?.data?.[0]?.price?.id || null,
                    currentPeriodStart: new Date(subscription.current_period_start * 1000),
                    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
                    cancelAtPeriodEnd: subscription.cancel_at_period_end,
                    cancelledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
                    businessName: metadata.businessName,
                    businessType: metadata.businessType,
                    socialHandles: JSON.parse(metadata.socialHandles || '{}'),
                    contactEmail: metadata.contactEmail,
                    contactPhone: metadata.contactPhone,
                    description: metadata.description
                }
            });

            res.json({ success: true, subscription: withUiStatus(localSub) });

        } catch (error) {
            console.error('Verify subscription error:', error);
            next(error);
        }
    },

    /**
     * Get Current User Subscription
     */
    getMySubscription: async (req, res, next) => {
        try {
            const userId = req.user.id;
            const subscription = await prisma.socialSubscription.findUnique({
                where: { userId }
            });

            // If exists, sync with Stripe to ensure latest status
            if (subscription && subscription.stripeSubscriptionId) {
                try {
                    const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
                    if (
                        stripeSub.status !== subscription.status ||
                        stripeSub.cancel_at_period_end !== subscription.cancelAtPeriodEnd ||
                        new Date(stripeSub.current_period_end * 1000).getTime() !== new Date(subscription.currentPeriodEnd).getTime()
                    ) {
                        await prisma.socialSubscription.update({
                            where: { userId },
                            data: {
                                status: stripeSub.status,
                                currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
                                currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
                                cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
                                cancelledAt: stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000) : null,
                                stripePriceId: stripeSub.items?.data?.[0]?.price?.id || null,
                            }
                        });
                        subscription.status = stripeSub.status;
                        subscription.currentPeriodStart = new Date(stripeSub.current_period_start * 1000);
                        subscription.currentPeriodEnd = new Date(stripeSub.current_period_end * 1000);
                        subscription.cancelAtPeriodEnd = stripeSub.cancel_at_period_end;
                        subscription.cancelledAt = stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000) : null;
                        subscription.stripePriceId = stripeSub.items?.data?.[0]?.price?.id || null;
                    }
                } catch (e) {
                    console.error('Error syncing with stripe:', e);
                }
            }

            res.json({ success: true, data: withUiStatus(subscription) });
        } catch (error) {
            console.error('Get my subscription error:', error);
            next(error);
        }
    },

    /**
     * Cancel Subscription
     */
    cancelSubscription: async (req, res, next) => {
        try {
            const userId = req.user.id;
            const subscription = await prisma.socialSubscription.findUnique({ where: { userId } });

            if (!subscription || !subscription.stripeSubscriptionId) {
                return res.status(404).json({ message: 'No active subscription found' });
            }

            // Cancel at period end
            const updatedStripeSub = await stripe.subscriptions.update(
                subscription.stripeSubscriptionId,
                { cancel_at_period_end: true }
            );

            const updatedSub = await prisma.socialSubscription.update({
                where: { userId },
                data: {
                    status: updatedStripeSub.status,
                    cancelAtPeriodEnd: true,
                    currentPeriodStart: new Date(updatedStripeSub.current_period_start * 1000),
                    currentPeriodEnd: new Date(updatedStripeSub.current_period_end * 1000),
                }
            });

            res.json({
                success: true,
                message: 'Subscription cancelled. It will remain active until the end of the billing period.',
                data: withUiStatus(updatedSub),
            });

        } catch (error) {
            console.error('Cancel subscription error:', error);
            next(error);
        }
    },

    /**
     * Renew subscription
     * - If current subscription is active but scheduled to cancel, resume auto-renew.
     * - If cancelled/expired, create a fresh checkout session.
     */
    renewSubscription: async (req, res, next) => {
        try {
            const userId = req.user.id;
            const subscription = await prisma.socialSubscription.findUnique({ where: { userId } });

            if (!subscription) {
                return res.status(404).json({ message: 'No subscription found to renew' });
            }

            if (!subscription.stripeSubscriptionId) {
                return res.status(400).json({ message: 'Subscription cannot be renewed at this time' });
            }

            let stripeSub = null;
            try {
                stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
            } catch (error) {
                console.error('Renew: unable to retrieve existing Stripe subscription', error);
            }

            if (stripeSub && (stripeSub.status === 'active' || stripeSub.status === 'trialing') && stripeSub.cancel_at_period_end) {
                const resumedStripeSub = await stripe.subscriptions.update(
                    subscription.stripeSubscriptionId,
                    { cancel_at_period_end: false }
                );

                const updatedSub = await prisma.socialSubscription.update({
                    where: { userId },
                    data: {
                        status: resumedStripeSub.status,
                        cancelAtPeriodEnd: false,
                        cancelledAt: null,
                        currentPeriodStart: new Date(resumedStripeSub.current_period_start * 1000),
                        currentPeriodEnd: new Date(resumedStripeSub.current_period_end * 1000),
                        stripePriceId: resumedStripeSub.items?.data?.[0]?.price?.id || null,
                    }
                });

                return res.json({
                    success: true,
                    message: 'Subscription renewed successfully.',
                    data: withUiStatus(updatedSub),
                });
            }

            if (stripeSub && (stripeSub.status === 'active' || stripeSub.status === 'trialing') && !stripeSub.cancel_at_period_end) {
                return res.status(400).json({ message: 'Subscription is already active' });
            }

            const metadata = {
                userId,
                businessName: subscription.businessName,
                businessType: subscription.businessType,
                socialHandles: JSON.stringify(subscription.socialHandles || {}),
                contactEmail: subscription.contactEmail,
                contactPhone: subscription.contactPhone,
                description: subscription.description ? subscription.description.substring(0, 500) : ''
            };

            const sessionPayload = {
                payment_method_types: ['card'],
                mode: 'subscription',
                line_items: buildSubscriptionLineItems(),
                metadata,
                success_url: `${process.env.FRONTEND_URL}/settings?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.FRONTEND_URL}/social-media-subscription?cancelled=true`,
            };

            if (subscription.stripeCustomerId) {
                sessionPayload.customer = subscription.stripeCustomerId;
            } else {
                sessionPayload.customer_email = subscription.contactEmail || req.user.email;
            }

            let session;
            try {
                session = await stripe.checkout.sessions.create(sessionPayload);
            } catch (error) {
                if (subscription.stripeCustomerId) {
                    // Fallback when cached customer was removed/invalid in Stripe.
                    delete sessionPayload.customer;
                    sessionPayload.customer_email = subscription.contactEmail || req.user.email;
                    session = await stripe.checkout.sessions.create(sessionPayload);
                } else {
                    throw error;
                }
            }

            return res.json({
                success: true,
                url: session.url,
                sessionId: session.id,
                message: 'Redirecting to checkout...',
            });

        } catch (error) {
            console.error('Renew subscription error:', error);
            next(error);
        }
    },

    /**
     * Admin: Get all subscriptions
     */
    getAllSubscriptions: async (req, res, next) => {
        try {
            const { page = 1, limit = 10, status, search } = req.query;
            const parsedPage = parseInt(page, 10) || 1;
            const parsedLimit = parseInt(limit, 10) || 10;
            const skip = (parsedPage - 1) * parsedLimit;

            const where = {};
            if (status) {
                if (status === 'cancelled') {
                    where.status = { in: ['cancelled', 'canceled'] };
                } else if (status === 'active') {
                    where.status = { in: ['active', 'trialing'] };
                } else if (status === 'past_due') {
                    where.status = { in: ['past_due', 'unpaid', 'incomplete'] };
                } else if (status === 'cancels_soon') {
                    where.status = { in: ['active', 'trialing'] };
                    where.cancelAtPeriodEnd = true;
                } else if (status === 'expired') {
                    where.AND = [
                        { status: { notIn: ['active', 'trialing'] } },
                        { currentPeriodEnd: { lt: new Date() } }
                    ];
                } else {
                    where.status = status;
                }
            }

            if (search) {
                where.OR = [
                    { businessName: { contains: search, mode: 'insensitive' } },
                    { businessType: { contains: search, mode: 'insensitive' } },
                    { contactEmail: { contains: search, mode: 'insensitive' } },
                    {
                        user: {
                            is: {
                                OR: [
                                    { firstName: { contains: search, mode: 'insensitive' } },
                                    { lastName: { contains: search, mode: 'insensitive' } },
                                    { email: { contains: search, mode: 'insensitive' } }
                                ]
                            }
                        }
                    }
                ];
            }

            const [subscriptions, total] = await Promise.all([
                prisma.socialSubscription.findMany({
                    where,
                    include: {
                        user: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                email: true,
                                photo: true
                            }
                        }
                    },
                    skip,
                    take: parsedLimit,
                    orderBy: { createdAt: 'desc' }
                }),
                prisma.socialSubscription.count({ where })
            ]);

            res.json({
                success: true,
                data: subscriptions.map((item) => withUiStatus(item)),
                pagination: {
                    total,
                    page: parsedPage,
                    pages: Math.ceil(total / parsedLimit)
                }
            });

        } catch (error) {
            console.error('Get all subscriptions error:', error);
            next(error);
        }
    },

    /**
     * Admin: Cancel any subscription (at period end)
     */
    adminCancelSubscription: async (req, res, next) => {
        try {
            const { subscriptionId } = req.params;
            const subscription = await prisma.socialSubscription.findUnique({
                where: { id: subscriptionId }
            });

            if (!subscription || !subscription.stripeSubscriptionId) {
                return res.status(404).json({ message: 'Subscription not found' });
            }

            const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
            let updatedStripeSub = stripeSub;

            if ((stripeSub.status === 'active' || stripeSub.status === 'trialing') && !stripeSub.cancel_at_period_end) {
                updatedStripeSub = await stripe.subscriptions.update(
                    subscription.stripeSubscriptionId,
                    { cancel_at_period_end: true }
                );
            }

            const updatedSub = await prisma.socialSubscription.update({
                where: { id: subscriptionId },
                data: {
                    status: updatedStripeSub.status,
                    cancelAtPeriodEnd: updatedStripeSub.cancel_at_period_end,
                    currentPeriodStart: new Date(updatedStripeSub.current_period_start * 1000),
                    currentPeriodEnd: new Date(updatedStripeSub.current_period_end * 1000),
                }
            });

            res.json({
                success: true,
                message: 'Subscription scheduled for cancellation.',
                data: withUiStatus(updatedSub),
            });
        } catch (error) {
            console.error('Admin cancel subscription error:', error);
            next(error);
        }
    },

    /**
     * Admin: Reactivate auto-renew for an active subscription scheduled to cancel.
     */
    adminReactivateSubscription: async (req, res, next) => {
        try {
            const { subscriptionId } = req.params;
            const subscription = await prisma.socialSubscription.findUnique({
                where: { id: subscriptionId }
            });

            if (!subscription || !subscription.stripeSubscriptionId) {
                return res.status(404).json({ message: 'Subscription not found' });
            }

            const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);

            if (stripeSub.status !== 'active' && stripeSub.status !== 'trialing') {
                return res.status(400).json({
                    message: 'Only active subscriptions can be reactivated. Ask the user to renew from checkout.',
                });
            }

            if (!stripeSub.cancel_at_period_end) {
                return res.status(400).json({ message: 'Subscription is already active and auto-renewing' });
            }

            const resumedStripeSub = await stripe.subscriptions.update(
                subscription.stripeSubscriptionId,
                { cancel_at_period_end: false }
            );

            const updatedSub = await prisma.socialSubscription.update({
                where: { id: subscriptionId },
                data: {
                    status: resumedStripeSub.status,
                    cancelAtPeriodEnd: false,
                    cancelledAt: null,
                    currentPeriodStart: new Date(resumedStripeSub.current_period_start * 1000),
                    currentPeriodEnd: new Date(resumedStripeSub.current_period_end * 1000),
                    stripePriceId: resumedStripeSub.items?.data?.[0]?.price?.id || null,
                }
            });

            res.json({
                success: true,
                message: 'Subscription reactivated successfully.',
                data: withUiStatus(updatedSub),
            });
        } catch (error) {
            console.error('Admin reactivate subscription error:', error);
            next(error);
        }
    }
};

module.exports = subscriptionController;
