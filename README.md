# Chicago Nigeria Backend API

Backend service for the Chicago Nigeria platform built with Node.js, Express, Prisma, and PostgreSQL.

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Database Setup

Create a PostgreSQL database:
```bash
createdb chicago_nigeria
```

Update `.env` file with your database connection:
```
DATABASE_URL="postgresql://username:password@localhost:5432/chicago_nigeria?schema=public"
```

### 3. Run Prisma Migrations
```bash
npm run prisma:migrate
```

This will create all the tables in your database.

### 4. Generate Prisma Client
```bash
npm run prisma:generate
```

### 5. (Optional) Seed Database
```bash
npm run prisma:seed
```

### 6. Start Development Server
```bash
npm run dev
```

Server will run on `http://localhost:5000`

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

- `DATABASE_URL` - PostgreSQL connection string
- `JWT_ACCESS_SECRET` - Secret for access tokens
- `JWT_REFRESH_SECRET` - Secret for refresh tokens
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` - Email configuration for OTP
- `CLOUDINARY_*` - Cloudinary credentials for image uploads

## API Endpoints

### Authentication (OTP-based)
- `POST /api/auth/send-otp` - Send OTP for signup
- `POST /api/auth/signup-simple` - Signup with OTP verification
- `POST /api/auth/send-signin-otp` - Send OTP for signin
- `POST /api/auth/signin-with-otp` - Signin with OTP
- `GET /api/auth/session` - Get current user session
- `POST /api/auth/logout` - Logout user
- `POST /api/auth/refresh-token` - Refresh access token

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update profile
- `PUT /api/users/preferences` - Update preferences

### Listings
- `GET /api/listings` - Get all listings
- `GET /api/listings/:id` - Get listing by ID
- `POST /api/listings` - Create listing (auth required)
- `PUT /api/listings/:id` - Update listing (auth required)
- `DELETE /api/listings/:id` - Delete listing (auth required)
- `POST /api/listings/:id/like` - Toggle like (auth required)
- `POST /api/listings/:id/save` - Toggle save (auth required)

### Events
- `GET /api/events` - Get all events
- `GET /api/events/:id` - Get event by ID
- `POST /api/events` - Create event (auth required)
- `POST /api/events/:id/purchase-ticket` - Purchase ticket (auth required)

### Posts/Feeds
- `GET /api/posts` - Get all posts
- `POST /api/posts` - Create post (auth required)
- `POST /api/posts/:id/like` - Toggle like (auth required)
- `POST /api/posts/:id/comment` - Add comment (auth required)

### Groups
- `GET /api/groups` - Get all groups
- `POST /api/groups` - Create group (auth required)
- `POST /api/groups/:id/join` - Join group (auth required)

### Messages
- `GET /api/messages` - Get conversations (auth required)
- `GET /api/messages/:userId` - Get messages with user (auth required)
- `POST /api/messages` - Send message (auth required)

### Notifications
- `GET /api/notifications` - Get notifications (auth required)
- `PUT /api/notifications/:id/read` - Mark as read (auth required)

## Database Schema

Key models:
- **User** - User accounts with OTP verification
- **Listing** - Marketplace listings
- **Event** - Events with ticketing
- **Post** - Social feed posts
- **Group** - Community groups
- **Message** - Direct messaging
- **Notification** - User notifications
- **Like/Save** - Polymorphic engagement

## Development

```bash
# Run in development with auto-reload
npm run dev

# View database in Prisma Studio
npm run prisma:studio

# Create new migration
npm run prisma:migrate

# Reset database (WARNING: deletes all data)
npx prisma migrate reset
```

## Production Deployment

1. Set `NODE_ENV=production`
2. Update `DATABASE_URL` to production database
3. Set secure `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`
4. Configure SMTP for production email service
5. Run migrations: `npm run prisma:migrate`
6. Start server: `npm start`
