const Stripe = require('stripe');

// Initialize Stripe with secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia', // Latest API version
});

// Platform fee per ticket (in cents)
const PLATFORM_FEE_PER_TICKET = 500; // $5.00

// Stripe fee calculation (approximate - actual fee is calculated by Stripe)
// US: 2.9% + $0.30 per successful card charge
const calculateStripeFee = (amountInCents) => {
  const percentageFee = Math.round(amountInCents * 0.029);
  const fixedFee = 30; // $0.30
  return percentageFee + fixedFee;
};

// Calculate total amount to charge buyer (ticket price + processing fee)
const calculateBuyerTotal = (ticketPriceInCents, quantity) => {
  const subtotal = ticketPriceInCents * quantity;
  const processingFee = calculateStripeFee(subtotal);
  return {
    subtotal,
    processingFee,
    total: subtotal + processingFee,
  };
};

// Calculate organizer payout (ticket price - platform fee)
const calculateOrganizerPayout = (ticketPriceInCents, quantity) => {
  const subtotal = ticketPriceInCents * quantity;
  const platformFee = PLATFORM_FEE_PER_TICKET * quantity;
  return {
    subtotal,
    platformFee,
    payout: subtotal - platformFee,
  };
};

module.exports = {
  stripe,
  PLATFORM_FEE_PER_TICKET,
  calculateStripeFee,
  calculateBuyerTotal,
  calculateOrganizerPayout,
};
