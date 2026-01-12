const prisma = require('../config/prisma');

const notificationController = {
  getNotifications: async (req, res, next) => {
    res.json({ success: true, message: 'Get notifications - TODO' });
  },

  markAsRead: async (req, res, next) => {
    res.json({ success: true, message: 'Mark notification as read - TODO' });
  },

  markAllAsRead: async (req, res, next) => {
    res.json({ success: true, message: 'Mark all as read - TODO' });
  },
};

module.exports = notificationController;
