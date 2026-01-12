const prisma = require('../config/prisma');

const messageController = {
  getConversations: async (req, res, next) => {
    res.json({ success: true, message: 'Get conversations - TODO' });
  },

  getMessagesWith: async (req, res, next) => {
    res.json({ success: true, message: 'Get messages with user - TODO' });
  },

  sendMessage: async (req, res, next) => {
    res.json({ success: true, message: 'Send message - TODO' });
  },

  markAsRead: async (req, res, next) => {
    res.json({ success: true, message: 'Mark as read - TODO' });
  },
};

module.exports = messageController;
