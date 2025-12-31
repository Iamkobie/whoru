const mongoose = require('mongoose');

const groupMessageSchema = new mongoose.Schema({
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Message content
  content: {
    text: String,
    type: {
      type: String,
      enum: ['text', 'image', 'video', 'voice', 'file', 'system'],
      default: 'text'
    },
    mediaUrl: String,
    mediaPublicId: String,
    thumbnail: String,
    duration: Number, // for voice/video
    fileName: String,
    fileSize: Number
  },
  // 🔥 UNIQUE: Reply to another message
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GroupMessage'
  },
  // 🎨 UNIQUE: Live reactions on messages (like Slack)
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: String,
    reactedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Read receipts
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Message status
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: Date,
  // 📌 UNIQUE: Pinned messages
  isPinned: {
    type: Boolean,
    default: false
  },
  pinnedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  pinnedAt: Date
}, {
  timestamps: true
});

// Indexes
groupMessageSchema.index({ group: 1, createdAt: -1 });
groupMessageSchema.index({ sender: 1 });
groupMessageSchema.index({ isPinned: 1, group: 1 });

module.exports = mongoose.model('GroupMessage', groupMessageSchema);
