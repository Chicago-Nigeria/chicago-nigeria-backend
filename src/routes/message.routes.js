const express = require('express');
const router = express.Router();
const messageController = require('../controllers/message.controller');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, messageController.getConversations);
router.get('/:userId', authenticate, messageController.getMessagesWith);
router.post('/', authenticate, messageController.sendMessage);
router.put('/:id/read', authenticate, messageController.markAsRead);

module.exports = router;
