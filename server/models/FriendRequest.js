const mongoose = require('mongoose');

/**
 * Friend Request Schema
 * Manages friend request lifecycle: pending, accepted, declined
 */
const friendRequestSchema = new mongoose.Schema({
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
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined'],
    default: 'pending'
  }
}, {
  timestamps: true
});

// Compound index to prevent duplicate requests
friendRequestSchema.index({ sender: 1, receiver: 1 }, { unique: true });

module.exports = mongoose.model('FriendRequest', friendRequestSchema);
