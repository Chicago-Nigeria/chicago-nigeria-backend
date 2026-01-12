const express = require('express');
const router = express.Router();
const eventController = require('../controllers/event.controller');
const { authenticate } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

// Event CRUD
router.get('/', eventController.getAllEvents);
router.get('/:id', eventController.getEventById);
router.post('/', authenticate, upload.single('coverImage'), eventController.createEvent);
router.put('/:id', authenticate, upload.single('coverImage'), eventController.updateEvent);
router.delete('/:id', authenticate, eventController.deleteEvent);

// Event registration and tickets
router.post('/:eventId/register', authenticate, eventController.registerForEvent);
router.post('/:id/purchase-ticket', authenticate, eventController.purchaseTicket);

// User's events
router.get('/user/attending', authenticate, eventController.getAttendingEvents);
router.get('/user/hosted', authenticate, eventController.getHostedEvents);
router.get('/user/past', authenticate, eventController.getPastEvents);

// Event interactions
router.post('/:id/like', authenticate, eventController.toggleLike);

module.exports = router;
