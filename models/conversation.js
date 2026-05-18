const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  type: { type: String, enum: ['support','designer','merchant'], default: 'support' },
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  unreadCount: {
    type: Map, of: Number, default: {}
  },
  isActive: { type: Boolean, default: true },
  orderId:  { type: String, default: null }, 
  productId:{ type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Conversation', conversationSchema);