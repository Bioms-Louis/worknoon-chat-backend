const router = require('express').Router();
const { protect, restrictTo } = require('../middleware/authMiddleware');
const authCtrl  = require('../controllers/authController');
const msgCtrl   = require('../controllers/messageController');
const convoCtrl = require('../controllers/conversationController');
const userCtrl  = require('../controllers/userController');

// Auth
router.post('/auth/signup', authCtrl.signup);
router.post('/auth/login',  authCtrl.login);

// Conversations (CRUD)
router.get   ('/conversations',          protect, convoCtrl.getAll);
router.post  ('/conversations',          protect, convoCtrl.create);
router.get   ('/conversations/:id',      protect, convoCtrl.getOne);
router.delete('/conversations/:id',      protect, convoCtrl.remove);

// Messages
router.get ('/conversations/:id/messages', protect, msgCtrl.getMessages);
router.post('/conversations/:id/messages', protect, msgCtrl.sendMessage);
router.patch('/messages/:id/read',         protect, msgCtrl.markRead);

// Users (admin only for listing)
router.get('/users',      protect, restrictTo('admin'), userCtrl.getAll);
router.get('/users/me',   protect, userCtrl.getMe);
router.patch('/users/me', protect, userCtrl.updateMe);

module.exports = router;