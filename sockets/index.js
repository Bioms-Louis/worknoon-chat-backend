const jwt  = require('jsonwebtoken');
const User = require('../models/user');
const Message      = require('../models/message');
const Conversation = require('../models/conversation');

module.exports = (io) => {
  // Auth middleware for sockets
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Unauthorized'));
    try {
      const { id } = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = await User.findById(id);
      next();
    } catch { next(new Error('Invalid token')); }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user._id.toString();

    // Mark user online
    await User.findByIdAndUpdate(userId, { isOnline: true });
    io.emit('user:online', { userId });

    // Join personal room for targeted delivery
    socket.join(userId);

    // Join a conversation room
    socket.on('join:conversation', (convId) => socket.join(convId));

    // New message
    socket.on('message:send', async ({ conversationId, content, type, fileUrl, fileName }) => {
      const msg = await Message.create({
        conversation: conversationId,
        sender: userId,
        content, type, fileUrl, fileName,
        readBy: [userId],
      });
      await Conversation.findByIdAndUpdate(conversationId, { lastMessage: msg._id });
      const populated = await msg.populate('sender', 'name avatar role');
      io.to(conversationId).emit('message:new', populated);
    });

    // Typing indicators
    socket.on('typing:start', ({ conversationId }) =>
      socket.to(conversationId).emit('typing:start', { userId, conversationId }));
    socket.on('typing:stop', ({ conversationId }) =>
      socket.to(conversationId).emit('typing:stop', { userId, conversationId }));

    // Mark read
    socket.on('message:read', async ({ messageId, conversationId }) => {
      await Message.findByIdAndUpdate(messageId, { $addToSet: { readBy: userId } });
      socket.to(conversationId).emit('message:read', { messageId, userId });
    });

    // Disconnect
    socket.on('disconnect', async () => {
      await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
      io.emit('user:offline', { userId, lastSeen: new Date() });
    });
  });
};