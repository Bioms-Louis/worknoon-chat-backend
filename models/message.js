const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Message body (empty string allowed for file-only messages)
    content: {
      type: String,
      default: "",
      maxlength: [5000, "Message cannot exceed 5000 characters"],
    },
    // Message type
    type: {
      type: String,
      enum: ["text", "image", "file", "system"],
      default: "text",
    },
    // File attachment fields
    fileUrl: {
      type: String,
      default: null,
    },
    fileName: {
      type: String,
      default: null,
    },
    fileSize: {
      type: Number, // bytes
      default: null,
    },
    fileMimeType: {
      type: String,
      default: null,
    },
    filePublicId: {
      type: String, // Cloudinary public_id for deletion
      default: null,
    },
    // Read receipts — array of user IDs who have read this
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // Soft delete
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

//  Index for fast message retrieval in a convo 
messageSchema.index({ conversation: 1, createdAt: 1 });

//  Virtual: is it read by a specific user 
messageSchema.methods.isReadBy = function (userId) {
  return this.readBy.some((id) => id.toString() === userId.toString());
};

//  When soft-deleted, hide content 
messageSchema.pre(/^find/, function (next) {
  // Don't filter by default — controllers decide; this is just a note
  next();
});

module.exports = mongoose.model("Message", messageSchema);
