const express = require('express');
const router = express.Router();
const messageController = require('../controllers/message.controller');
const { authenticate } = require('../middleware/auth');
const { uploadMedia } = require('../middleware/upload');

router.get('/', authenticate, messageController.getConversations);
router.get('/stream', authenticate, messageController.streamMessages);
router.get('/:userId', authenticate, messageController.getMessagesWith);
router.post('/', authenticate, uploadMedia.array('media', 8), messageController.sendMessage);
router.put('/:id/read', authenticate, messageController.markAsRead);
router.put('/with/:userId/read', authenticate, messageController.markConversationAsRead);

module.exports = router;
