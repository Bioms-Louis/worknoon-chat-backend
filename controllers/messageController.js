const Message      = require("../models/message");
const Conversation = require("../models/conversation");
const Notification = require("../models/Notification");
const { uploadToCloudinary, deleteFromCloudinary } = require("../middleware/uploadMiddleware");
const { sendNewMessageEmail } = require("../utils/email");
const User = require("../models/user");

//  Helper: check participant access 
const assertParticipant = async (conversationId, userId, role) => {
  const convo = await Conversation.findById(conversationId);
  if (!convo) return { error: "Conversation not found.", status: 404 };
  const isParticipant = convo.participants.some(
    (p) => p.toString() === userId.toString()
  );
  if (!isParticipant && role !== "admin") {
    return { error: "Access denied.", status: 403 };
  }
  return { convo };
};

// GET /api/conversations/:id/messages 
exports.getMessages = async (req, res) => {
  try {
    const { id: conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const { error, status } = await assertParticipant(
      conversationId,
      req.user._id,
      req.user.role
    );
    if (error) return res.status(status).json({ message: error });

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await Message.countDocuments({
      conversation: conversationId,
      isDeleted: false,
    });

    const messages = await Message.find({
      conversation: conversationId,
      isDeleted: false,
    })
      .populate("sender", "name avatar role")
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(Number(limit));

    res.json({ messages, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/conversations/:id/messages 
exports.sendMessage = async (req, res) => {
  try {
    const { id: conversationId } = req.params;
    const { content = "", type = "text" } = req.body;

    const { error, status, convo } = await assertParticipant(
      conversationId,
      req.user._id,
      req.user.role
    );
    if (error) return res.status(status).json({ message: error });
    if (!convo.isActive) {
      return res.status(400).json({ message: "This conversation is closed." });
    }

    let fileUrl      = null;
    let fileName     = null;
    let fileSize     = null;
    let fileMimeType = null;
    let filePublicId = null;
    let msgType      = type;

    // ── Handle file upload ────────────────────────
    if (req.file) {
      const isImage = req.file.mimetype.startsWith("image/");
      msgType = isImage ? "image" : "file";

      const result = await uploadToCloudinary(
        req.file.buffer,
        "messages",
        isImage ? "image" : "raw"
      );
      fileUrl      = result.secure_url;
      filePublicId = result.public_id;
      fileName     = req.file.originalname;
      fileSize     = req.file.size;
      fileMimeType = req.file.mimetype;
    }

    if (!content.trim() && !fileUrl) {
      return res.status(400).json({ message: "Message must have content or a file." });
    }

    // ── Create message ────────────────────────────
    const message = await Message.create({
      conversation: conversationId,
      sender:       req.user._id,
      content:      content.trim(),
      type:         msgType,
      fileUrl,
      fileName,
      fileSize,
      fileMimeType,
      filePublicId,
      readBy:       [req.user._id],
    });

    // ── Update conversation ────────────────────────
    convo.lastMessage = message._id;
    convo.incrementUnread(req.user._id);
    await convo.save();

    const populated = await message.populate("sender", "name avatar role");

    // ── Notifications ─────────────────────────────
    const otherParticipants = convo.participants.filter(
      (p) => p.toString() !== req.user._id.toString()
    );

    for (const recipientId of otherParticipants) {
      // In-app notification
      await Notification.create({
        recipient:    recipientId,
        type:         "new_message",
        title:        `New message from ${req.user.name}`,
        body:         content || `Sent a ${msgType}`,
        conversation: conversationId,
        message:      message._id,
      });

      // Email notification (async, non-blocking)
      User.findById(recipientId).then((recipient) => {
        if (recipient) {
          sendNewMessageEmail(
            recipient,
            req.user,
            conversationId,
            content || `[${msgType}]`
          ).catch(() => {});
        }
      });
    }

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── PATCH /api/messages/:id/read ─────────────────
exports.markRead = async (req, res) => {
  try {
    const message = await Message.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { readBy: req.user._id } },
      { new: true }
    );
    if (!message) return res.status(404).json({ message: "Message not found." });

    // Reset conversation unread count
    await Conversation.findByIdAndUpdate(message.conversation, {
      $set: { [`unreadCount.${req.user._id}`]: 0 },
    });

    res.json({ messageId: message._id, readBy: message.readBy });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── PATCH /api/conversations/:id/read-all ────────
exports.markAllRead = async (req, res) => {
  try {
    const { id: conversationId } = req.params;
    await Message.updateMany(
      { conversation: conversationId, readBy: { $ne: req.user._id } },
      { $addToSet: { readBy: req.user._id } }
    );
    await Conversation.findByIdAndUpdate(conversationId, {
      $set: { [`unreadCount.${req.user._id}`]: 0 },
    });
    res.json({ message: "All messages marked as read." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── DELETE /api/messages/:id ─────────────────────
exports.deleteMessage = async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ message: "Message not found." });

    // Only sender or admin can delete
    if (
      message.sender.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ message: "Not authorized to delete this message." });
    }

    // Soft delete
    message.isDeleted = true;
    message.deletedAt = new Date();
    message.content   = "";   // wipe content
    await message.save();

    // Delete file from Cloudinary if any
    if (message.filePublicId) {
      const rType = message.type === "image" ? "image" : "raw";
      deleteFromCloudinary(message.filePublicId, rType).catch(() => {});
    }

    res.json({ message: "Message deleted.", messageId: message._id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
