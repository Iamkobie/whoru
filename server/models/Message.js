const mongoose = require('mongoose');

/**
 * Message Schema
 * Stores 1v1 chat messages with read receipts and media support
 */
const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    trim: true,
    maxlength: [1000, 'Message cannot exceed 1000 characters']
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'video', 'audio'],
    default: 'text'
  },
  mediaUrl: {
    type: String,
    default: null
  },
  mediaPublicId: {
    type: String,
    default: null
  },
  mediaThumbnail: {
    type: String,
    default: null
  },
  mediaDuration: {
    type: Number, // For audio/video in seconds
    default: null
  },
  read: {
    type: Boolean,
    default: false
  },
  deleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index for faster queries
messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });
messageSchema.index({ deleted: 1 });

module.exports = mongoose.model('Message', messageSchema);
