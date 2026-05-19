const Notification = require("../models/Notification");

// ── GET /api/notifications ───────────────────────
exports.getAll = async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly } = req.query;
    const match = { recipient: req.user._id };
    if (unreadOnly === "true") match.isRead = false;

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await Notification.countDocuments(match);
    const unreadCount = await Notification.countDocuments({
      recipient: req.user._id,
      isRead: false,
    });

    const notifications = await Notification.find(match)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate("conversation", "type subject")
      .populate("message", "content type");

    res.json({ notifications, total, unreadCount, page: Number(page) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── PATCH /api/notifications/:id/read ────────────
exports.markRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { isRead: true, readAt: new Date() },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: "Notification not found." });
    res.json(notification);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── PATCH /api/notifications/read-all ────────────
exports.markAllRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    res.json({ message: "All notifications marked as read." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── DELETE /api/notifications/:id ────────────────
exports.deleteOne = async (req, res) => {
  try {
    await Notification.findOneAndDelete({
      _id: req.params.id,
      recipient: req.user._id,
    });
    res.json({ message: "Notification deleted." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
