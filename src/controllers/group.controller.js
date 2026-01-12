const prisma = require('../config/prisma');

const groupController = {
  getAllGroups: async (req, res, next) => {
    res.json({ success: true, message: 'Get all groups - TODO' });
  },

  getGroupById: async (req, res, next) => {
    res.json({ success: true, message: 'Get group - TODO' });
  },

  createGroup: async (req, res, next) => {
    res.json({ success: true, message: 'Create group - TODO' });
  },

  joinGroup: async (req, res, next) => {
    res.json({ success: true, message: 'Join group - TODO' });
  },

  leaveGroup: async (req, res, next) => {
    res.json({ success: true, message: 'Leave group - TODO' });
  },
};

module.exports = groupController;
