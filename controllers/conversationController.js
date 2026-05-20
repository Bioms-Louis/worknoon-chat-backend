const Conversation = require("../models/conversation");
const Message      = require("../models/message");
const User         = require("../models/user");
const Notification = require("../models/Notification");
const { sendAssignedEmail } = require("../utils/email");

// ── GET /api/conversations ───────────────────────
// Returns all conversations the current user is part of
exports.getAll = async (req, res) => {
  try {
    const { type, page = 1, limit = 30 } = req.query;

    const match = { participants: req.user._id };
    if (type) match.type = type;

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await Conversation.countDocuments(match);

    const conversations = await Conversation.find(match)
      .populate("participants", "name email role avatar isOnline lastSeen")
      .populate({
        path: "lastMessage",
        populate: { path: "sender", select: "name avatar" },
      })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    // Attach unread count for current user
    const result = conversations.map((c) => ({
      ...c.toObject(),
      unreadCount: c.unreadCount.get(req.user._id.toString()) || 0,
    }));

    res.json({ conversations: result, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── POST /api/conversations ──────────────────────
// Create or reuse an existing conversation
exports.create = async (req, res) => {
  try {
    const { participantId, type = "support", subject = "", orderId, productId } = req.body;

    if (!participantId) {
      return res.status(400).json({ message: "participantId is required." });
    }

    const otherUser = await User.findById(participantId);
    if (!otherUser || !otherUser.isActive) {
      return res.status(404).json({ message: "Participant not found." });
    }

    // Check if a conversation between these two already exists
    const existing = await Conversation.findOne({
      participants: { $all: [req.user._id, participantId], $size: 2 },
      type,
      isActive: true,
    }).populate("participants", "name email role avatar isOnline lastSeen");

    if (existing) {
      return res.json({ conversation: existing, isNew: false });
    }

    // Create new
    const conversation = await Conversation.create({
      participants: [req.user._id, participantId],
      type,
      subject,
      orderId:   orderId   || null,
      productId: productId || null,
    });

    const populated = await conversation.populate(
      "participants",
      "name email role avatar isOnline lastSeen"
    );

    // Notify the other participant
    await Notification.create({
      recipient:    participantId,
      type:         "conversation_assigned",
      title:        `New conversation from ${req.user.name}`,
      body:         subject || `${req.user.name} started a ${type} conversation with you.`,
      conversation: conversation._id,
    });

    // Email if agent/support assigned
    if (["agent", "admin"].includes(otherUser.role)) {
      sendAssignedEmail(otherUser, req.user, conversation._id).catch(() => {});
    }

    res.status(201).json({ conversation: populated, isNew: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/conversations/:id ───────────────────
exports.getOne = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id)
      .populate("participants", "name email role avatar isOnline lastSeen bio")
      .populate({
        path: "lastMessage",
        populate: { path: "sender", select: "name avatar" },
      });

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found." });
    }

    // Ensure user is a participant (unless admin)
    const isParticipant = conversation.participants.some(
      (p) => p._id.toString() === req.user._id.toString()
    );
    if (!isParticipant && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied." });
    }

    // Reset unread count for current user
    conversation.resetUnread(req.user._id);
    await conversation.save();

    res.json({
      ...conversation.toObject(),
      unreadCount: 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── PATCH /api/conversations/:id ─────────────────
exports.update = async (req, res) => {
  try {
    const { isActive, subject } = req.body;
    const updates = {};
    if (isActive  !== undefined) updates.isActive = isActive;
    if (subject   !== undefined) updates.subject  = subject;

    const conversation = await Conversation.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true }
    ).populate("participants", "name email role avatar isOnline");

    if (!conversation) return res.status(404).json({ message: "Conversation not found." });
    res.json(conversation);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── DELETE /api/conversations/:id ────────────────
// Soft-close — marks as inactive
exports.remove = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) return res.status(404).json({ message: "Conversation not found." });

    const isParticipant = conversation.participants.some(
      (p) => p.toString() === req.user._id.toString()
    );
    if (!isParticipant && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied." });
    }

    conversation.isActive = false;
    await conversation.save();
    res.json({ message: "Conversation closed." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/conversations/stats (admin) ─────────
exports.getStats = async (req, res) => {
  try {
    const [total, active, byType] = await Promise.all([
      Conversation.countDocuments(),
      Conversation.countDocuments({ isActive: true }),
      Conversation.aggregate([
        { $group: { _id: "$type", count: { $sum: 1 } } },
      ]),
    ]);
    res.json({ total, active, byType });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
