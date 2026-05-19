const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    // Type determines who the customer is talking to
    type: {
      type: String,
      enum: ["support", "designer", "merchant"],
      default: "support",
    },
    // Snapshot of the last message for sidebar preview
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    // Map of userId → unread count  e.g. { "abc123": 3 }
    unreadCount: {
      type: Map,
      of: Number,
      default: {},
    },
    // Whether the conversation is still active / open
    isActive: {
      type: Boolean,
      default: true,
    },
    // Optional WooCommerce / order context
    orderId: {
      type: String,
      default: null,
    },
    productId: {
      type: String,
      default: null,
    },
    // Conversation subject / title (optional)
    subject: {
      type: String,
      default: "",
      maxlength: 120,
    },
  },
  {
    timestamps: true,
  }
);

// ── Index for fast participant lookups ───────────
conversationSchema.index({ participants: 1 });
conversationSchema.index({ updatedAt: -1 });

// ── Helper: increment unread for all except sender
conversationSchema.methods.incrementUnread = function (senderId) {
  for (const participantId of this.participants) {
    const key = participantId.toString();
    if (key !== senderId.toString()) {
      const current = this.unreadCount.get(key) || 0;
      this.unreadCount.set(key, current + 1);
    }
  }
};

// ── Helper: reset unread for a specific user ─────
conversationSchema.methods.resetUnread = function (userId) {
  this.unreadCount.set(userId.toString(), 0);
};

module.exports = mongoose.model("Conversation", conversationSchema);
