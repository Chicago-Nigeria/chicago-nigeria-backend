const express = require('express');
const router = express.Router();
const groupController = require('../controllers/group.controller');
const { authenticate } = require('../middleware/auth');

router.get('/', groupController.getAllGroups);
router.get('/:id', groupController.getGroupById);
router.post('/', authenticate, groupController.createGroup);
router.post('/:id/join', authenticate, groupController.joinGroup);
router.post('/:id/leave', authenticate, groupController.leaveGroup);

module.exports = router;
