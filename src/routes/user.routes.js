const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

router.get('/profile', authenticate, userController.getProfile);
router.put('/profile', authenticate, userController.updateProfile);
router.put('/profile/photo', authenticate, upload.single('photo'), userController.updateProfilePhoto);
router.put('/preferences', authenticate, userController.updatePreferences);

module.exports = router;
