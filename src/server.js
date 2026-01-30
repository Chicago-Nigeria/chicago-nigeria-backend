require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

// Import routes
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const listingRoutes = require('./routes/listing.routes');
const eventRoutes = require('./routes/event.routes');
const postRoutes = require('./routes/post.routes');
const groupRoutes = require('./routes/group.routes');
const messageRoutes = require('./routes/message.routes');
const notificationRoutes = require('./routes/notification.routes');
const adminRoutes = require('./routes/admin.routes');
const paymentRoutes = require('./routes/payment.routes');
const feedRoutes = require('./routes/feed.routes');
const webhookController = require('./controllers/webhook.controller');

// Import middleware
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5002;

// Stripe webhook endpoint (must be before express.json() middleware)
// Needs raw body for signature verification
app.post('/api/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  webhookController.handleStripeWebhook
);

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:3000',
      'https://chicagonigerians.com',
      'https://www.chicagonigerians.com',
    ];
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      callback(null, true);
    } else if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else if (origin.endsWith('.ondigitalocean.app')) {
      // Allow all DigitalOcean app URLs for deployment flexibility
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Chicago Nigeria API is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/feed', feedRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Server running`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});
