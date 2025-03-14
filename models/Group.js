const mongoose = require('mongoose');
const groupMessageSchema = new mongoose.Schema({
  sender: { type: String },
  message: { type: String },
  timestamp: { type: Date, default: Date.now, index: true },
  isRead: { type: Boolean, default: false }
});
const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, index: true },
  members: { type: [String], default: [] },
  admin: { type: String, required: true }, //field for admin
  messages: [groupMessageSchema]
});

module.exports = mongoose.model('Group', groupSchema);
