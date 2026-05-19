const jwt          = require("jsonwebtoken");
const User         = require("../models/User");
const Message      = require("../models/Message");
const Conversation = require("../models/Conversation");
const Notification = require("../models/Notification");
const { sendNewMessageEmail } = require("../utils/email");

// Track active socket IDs per user: { userId: Set<socketId> }
const onlineUsers = new Map();

module.exports = (io) => {
  // ── Socket auth middleware ───────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Authentication required."));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user    = await User.findById(decoded.id);
      if (!user || !user.isActive) return next(new Error("User not found."));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error("Invalid token."));
    }
  });

  io.on("connection", async (socket) => {
    const userId   = socket.user._id.toString();
    const userName = socket.user.name;

    // ── Track online status ────────────────────────
    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);

    // Mark online in DB only on first socket connection
    if (onlineUsers.get(userId).size === 1) {
      await User.findByIdAndUpdate(userId, { isOnline: true });
      socket.broadcast.emit("user:online", { userId });
    }

    // Join personal room (for direct delivery)
    socket.join(userId);

    console.log(`🟢 ${userName} connected [${socket.id}] (${onlineUsers.get(userId).size} connections)`);

    // ── Join a conversation room ───────────────────
    socket.on("join:conversation", async (conversationId) => {
      try {
        // Verify user is a participant
        const convo = await Conversation.findById(conversationId);
        if (!convo) return;
        const isParticipant = convo.participants.some(
          (p) => p.toString() === userId
        );
        if (!isParticipant && socket.user.role !== "admin") return;

        socket.join(conversationId);
        socket.emit("joined:conversation", { conversationId });
      } catch (err) {
        console.error("join:conversation error:", err.message);
      }
    });

    // ── Leave a conversation room ──────────────────
    socket.on("leave:conversation", (conversationId) => {
      socket.leave(conversationId);
    });

    // ── Send a message ─────────────────────────────
    socket.on("message:send", async ({ conversationId, content, type = "text", fileUrl, fileName, fileSize, fileMimeType }) => {
      try {
        const convo = await Conversation.findById(conversationId);
        if (!convo || !convo.isActive) return;

        const isParticipant = convo.participants.some(
          (p) => p.toString() === userId
        );
        if (!isParticipant && socket.user.role !== "admin") return;

        if (!content?.trim() && !fileUrl) return;

        // Persist message
        const message = await Message.create({
          conversation: conversationId,
          sender:       userId,
          content:      content?.trim() || "",
          type,
          fileUrl:      fileUrl   || null,
          fileName:     fileName  || null,
          fileSize:     fileSize  || null,
          fileMimeType: fileMimeType || null,
          readBy:       [userId],
        });

        // Update conversation
        convo.lastMessage = message._id;
        convo.incrementUnread(userId);
        await convo.save();

        const populated = await message.populate("sender", "name avatar role");

        // Broadcast to everyone in the room (including sender)
        io.to(conversationId).emit("message:new", populated);

        // Notify offline / non-room participants
        const others = convo.participants.filter((p) => p.toString() !== userId);
        for (const recipientId of others) {
          const rid = recipientId.toString();

          // Save in-app notification
          const notif = await Notification.create({
            recipient:    rid,
            type:         "new_message",
            title:        `New message from ${socket.user.name}`,
            body:         content || `Sent a ${type}`,
            conversation: conversationId,
            message:      message._id,
          });

          // Push notification to their personal room
          io.to(rid).emit("notification:new", notif);

          // Email if user not currently online
          if (!onlineUsers.has(rid) || onlineUsers.get(rid).size === 0) {
            User.findById(rid).then((recipient) => {
              if (recipient) {
                sendNewMessageEmail(recipient, socket.user, conversationId, content || `[${type}]`).catch(() => {});
              }
            });
          }
        }
      } catch (err) {
        console.error("message:send socket error:", err.message);
        socket.emit("error", { message: "Failed to send message." });
      }
    });

    // ── Read receipt ───────────────────────────────
    socket.on("message:read", async ({ messageId, conversationId }) => {
      try {
        await Message.findByIdAndUpdate(messageId, {
          $addToSet: { readBy: userId },
        });
        await Conversation.findByIdAndUpdate(conversationId, {
          $set: { [`unreadCount.${userId}`]: 0 },
        });
        // Tell other participants
        socket.to(conversationId).emit("message:read", { messageId, userId });
      } catch (err) {
        console.error("message:read error:", err.message);
      }
    });

    // ── Read all ───────────────────────────────────
    socket.on("message:read-all", async ({ conversationId }) => {
      try {
        await Message.updateMany(
          { conversation: conversationId, readBy: { $ne: userId } },
          { $addToSet: { readBy: userId } }
        );
        await Conversation.findByIdAndUpdate(conversationId, {
          $set: { [`unreadCount.${userId}`]: 0 },
        });
        socket.to(conversationId).emit("message:read-all", { conversationId, userId });
      } catch (err) {
        console.error("message:read-all error:", err.message);
      }
    });

    // ── Typing indicators ──────────────────────────
    socket.on("typing:start", ({ conversationId }) => {
      socket.to(conversationId).emit("typing:start", {
        userId,
        userName,
        conversationId,
      });
    });

    socket.on("typing:stop", ({ conversationId }) => {
      socket.to(conversationId).emit("typing:stop", {
        userId,
        conversationId,
      });
    });

    // ── Message deleted ────────────────────────────
    socket.on("message:delete", async ({ messageId, conversationId }) => {
      try {
        const message = await Message.findById(messageId);
        if (!message) return;
        if (
          message.sender.toString() !== userId &&
          socket.user.role !== "admin"
        ) return;

        message.isDeleted = true;
        message.deletedAt = new Date();
        message.content   = "";
        await message.save();

        io.to(conversationId).emit("message:deleted", { messageId });
      } catch (err) {
        console.error("message:delete socket error:", err.message);
      }
    });

    // ── Online status query ────────────────────────
    socket.on("user:status", ({ userIds }) => {
      const statuses = {};
      for (const id of userIds) {
        statuses[id] = onlineUsers.has(id) && onlineUsers.get(id).size > 0;
      }
      socket.emit("user:statuses", statuses);
    });

    // ── Disconnect ─────────────────────────────────
    socket.on("disconnect", async () => {
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          await User.findByIdAndUpdate(userId, {
            isOnline: false,
            lastSeen: new Date(),
          });
          socket.broadcast.emit("user:offline", {
            userId,
            lastSeen: new Date(),
          });
          console.log(`🔴 ${userName} disconnected`);
        }
      }
    });
  });

  // Expose online map for use elsewhere
  io.onlineUsers = onlineUsers;
};
