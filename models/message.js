const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content:      { type: String, default: '' },
  type:         { type: String, enum: ['text','image','file'], default: 'text' },
  fileUrl:      { type: String, default: null },
  fileName:     { type: String, default: null },
  readBy:       [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isDeleted:    { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);