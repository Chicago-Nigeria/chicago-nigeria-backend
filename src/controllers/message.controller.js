const prisma = require('../config/prisma');
const { uploadToCloudinary, uploadVideoToCloudinary } = require('../utils/cloudinary');

const sseClients = new Map(); // Map<userId, Set<ServerResponse>>

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  photo: true,
  profession: true,
  location: true,
};

const messageInclude = {
  sender: { select: userSelect },
  receiver: { select: userSelect },
};

const isVisibleConversation = (user, search) => {
  if (!search) return true;
  const term = search.toLowerCase();
  return (
    `${user.firstName || ''} ${user.lastName || ''}`.toLowerCase().includes(term) ||
    (user.email || '').toLowerCase().includes(term)
  );
};

const addSseClient = (userId, res) => {
  if (!sseClients.has(userId)) {
    sseClients.set(userId, new Set());
  }
  sseClients.get(userId).add(res);
};

const removeSseClient = (userId, res) => {
  const clients = sseClients.get(userId);
  if (!clients) return;
  clients.delete(res);
  if (clients.size === 0) {
    sseClients.delete(userId);
  }
};

const sendSseEvent = (res, event, payload) => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

const broadcastToUser = (userId, event, payload) => {
  const clients = sseClients.get(userId);
  if (!clients || clients.size === 0) return;

  for (const client of clients) {
    sendSseEvent(client, event, payload);
  }
};

const toMessagePayload = (message) => ({
  id: message.id,
  content: message.content,
  images: message.images || [],
  videos: message.videos || [],
  isRead: message.isRead,
  readAt: message.readAt,
  senderId: message.senderId,
  receiverId: message.receiverId,
  createdAt: message.createdAt,
  sender: message.sender,
  receiver: message.receiver,
});

const messageController = {
  getConversations: async (req, res, next) => {
    try {
      const userId = req.user.id;
      const search = (req.query.search || '').trim();

      const messages = await prisma.message.findMany({
        where: {
          OR: [{ senderId: userId }, { receiverId: userId }],
        },
        include: messageInclude,
        orderBy: { createdAt: 'desc' },
      });

      const conversationMap = new Map();

      for (const msg of messages) {
        const isSender = msg.senderId === userId;
        const otherUser = isSender ? msg.receiver : msg.sender;
        const key = otherUser.id;

        if (!conversationMap.has(key)) {
          conversationMap.set(key, {
            user: otherUser,
            unreadCount: 0,
            lastMessage: {
              id: msg.id,
              content: msg.content,
              images: msg.images || [],
              videos: msg.videos || [],
              senderId: msg.senderId,
              receiverId: msg.receiverId,
              isRead: msg.isRead,
              readAt: msg.readAt,
              createdAt: msg.createdAt,
            },
            lastActivityAt: msg.createdAt,
          });
        }

        if (msg.receiverId === userId && !msg.isRead) {
          const current = conversationMap.get(key);
          current.unreadCount += 1;
        }
      }

      const conversations = Array.from(conversationMap.values())
        .filter((item) => isVisibleConversation(item.user, search))
        .sort((a, b) => new Date(b.lastActivityAt) - new Date(a.lastActivityAt));

      res.json({
        success: true,
        data: conversations,
      });
    } catch (error) {
      console.error('Get conversations error:', error);
      next(error);
    }
  },

  getMessagesWith: async (req, res, next) => {
    try {
      const authUserId = req.user.id;
      const { userId } = req.params;
      const { cursor, limit = 50 } = req.query;

      if (userId === authUserId) {
        return res.status(400).json({ success: false, message: 'Cannot open conversation with yourself' });
      }

      const conversationUser = await prisma.user.findUnique({
        where: { id: userId },
        select: userSelect,
      });

      if (!conversationUser) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
      const cursorDate = cursor ? new Date(cursor) : null;
      const where = {
        OR: [
          { senderId: authUserId, receiverId: userId },
          { senderId: userId, receiverId: authUserId },
        ],
        ...(cursorDate && !Number.isNaN(cursorDate.getTime())
          ? { createdAt: { lt: cursorDate } }
          : {}),
      };

      const rowsDesc = await prisma.message.findMany({
        where,
        include: messageInclude,
        orderBy: { createdAt: 'desc' },
        take: parsedLimit + 1,
      });

      const hasMore = rowsDesc.length > parsedLimit;
      const sliced = hasMore ? rowsDesc.slice(0, parsedLimit) : rowsDesc;
      const messages = sliced.reverse().map(toMessagePayload);

      const nextCursor = hasMore && sliced.length
        ? sliced[sliced.length - 1].createdAt.toISOString()
        : null;

      res.json({
        success: true,
        data: messages,
        meta: {
          hasMore,
          nextCursor,
          limit: parsedLimit,
        },
        conversationUser,
      });
    } catch (error) {
      console.error('Get messages with user error:', error);
      next(error);
    }
  },

  sendMessage: async (req, res, next) => {
    try {
      const senderId = req.user.id;
      const { receiverId } = req.body;
      const content = (req.body.content || '').trim();
      const files = Array.isArray(req.files) ? req.files : [];

      if (!receiverId) {
        return res.status(400).json({ success: false, message: 'receiverId is required' });
      }

      if (receiverId === senderId) {
        return res.status(400).json({ success: false, message: 'Cannot send message to yourself' });
      }

      if (!content && files.length === 0) {
        return res.status(400).json({ success: false, message: 'Message content or media is required' });
      }

      const receiver = await prisma.user.findUnique({
        where: { id: receiverId },
        select: { id: true, isActive: true },
      });

      if (!receiver || !receiver.isActive) {
        return res.status(404).json({ success: false, message: 'Receiver not found' });
      }

      const images = [];
      const videos = [];

      for (const file of files) {
        if (file.mediaType === 'video') {
          const videoUrl = await uploadVideoToCloudinary(file.buffer, 'message', senderId);
          videos.push(videoUrl);
        } else {
          const imageUrl = await uploadToCloudinary(file.buffer, 'message', senderId);
          images.push(imageUrl);
        }
      }

      const created = await prisma.message.create({
        data: {
          content,
          images,
          videos,
          senderId,
          receiverId,
        },
        include: messageInclude,
      });

      const payload = toMessagePayload(created);
      broadcastToUser(senderId, 'message:new', payload);
      broadcastToUser(receiverId, 'message:new', payload);

      res.json({
        success: true,
        data: payload,
      });
    } catch (error) {
      console.error('Send message error:', error);
      next(error);
    }
  },

  markAsRead: async (req, res, next) => {
    try {
      const authUserId = req.user.id;
      const { id } = req.params;

      const existing = await prisma.message.findUnique({
        where: { id },
      });

      if (!existing) {
        return res.status(404).json({ success: false, message: 'Message not found' });
      }

      if (existing.receiverId !== authUserId) {
        return res.status(403).json({ success: false, message: 'Not authorized to mark this message as read' });
      }

      if (existing.isRead) {
        return res.json({
          success: true,
          data: existing,
          message: 'Message already marked as read',
        });
      }

      const readAt = new Date();
      const updated = await prisma.message.update({
        where: { id },
        data: {
          isRead: true,
          readAt,
        },
      });

      const eventPayload = {
        messageIds: [id],
        readerId: authUserId,
        conversationUserId: existing.senderId,
        readAt,
      };
      broadcastToUser(existing.senderId, 'message:read', eventPayload);
      broadcastToUser(existing.receiverId, 'message:read', eventPayload);

      res.json({
        success: true,
        data: updated,
      });
    } catch (error) {
      console.error('Mark as read error:', error);
      next(error);
    }
  },

  markConversationAsRead: async (req, res, next) => {
    try {
      const authUserId = req.user.id;
      const { userId } = req.params;

      const unreadMessages = await prisma.message.findMany({
        where: {
          senderId: userId,
          receiverId: authUserId,
          isRead: false,
        },
        select: { id: true },
      });

      if (unreadMessages.length === 0) {
        return res.json({
          success: true,
          data: { count: 0, messageIds: [] },
        });
      }

      const ids = unreadMessages.map((m) => m.id);
      const readAt = new Date();

      await prisma.message.updateMany({
        where: { id: { in: ids } },
        data: {
          isRead: true,
          readAt,
        },
      });

      const eventPayload = {
        messageIds: ids,
        readerId: authUserId,
        conversationUserId: userId,
        readAt,
      };
      broadcastToUser(userId, 'message:read', eventPayload);
      broadcastToUser(authUserId, 'message:read', eventPayload);

      res.json({
        success: true,
        data: { count: ids.length, messageIds: ids, readAt },
      });
    } catch (error) {
      console.error('Mark conversation as read error:', error);
      next(error);
    }
  },

  streamMessages: async (req, res, next) => {
    try {
      const userId = req.user.id;

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
      }

      addSseClient(userId, res);
      sendSseEvent(res, 'connected', { ok: true, userId, at: new Date().toISOString() });

      const heartbeat = setInterval(() => {
        sendSseEvent(res, 'heartbeat', { at: new Date().toISOString() });
      }, 25000);

      req.on('close', () => {
        clearInterval(heartbeat);
        removeSseClient(userId, res);
        res.end();
      });
    } catch (error) {
      console.error('Message stream error:', error);
      next(error);
    }
  },
};

module.exports = messageController;
