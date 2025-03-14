const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: { type: String, required: true, index: true },
  receiver: { type: String, index: true },
  group: { type: String },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now, index: true },  // Added index
  isRead: { type: Boolean, default: false }
});

module.exports = mongoose.model('Message', messageSchema);
