const mongoose = require('mongoose');

/**
 * Notification Schema
 * Handles all types of user notifications
 */
const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: [
      'friend_request',
      'friend_accept',
      'profile_reaction',
      'profile_view',
      'new_message',
      'message_reaction',
      'group_join',
      'group_invite',
      'story_reaction',
      'story_reply',
      'challenge_response',
      'activity_match',
      'activity_join_request',
      'activity_request_accepted'
    ],
    required: true
  },
  message: {
    type: String,
    required: true
  },
  link: {
    type: String, // URL to navigate when clicked
    default: null
  },
  read: {
    type: Boolean,
    default: false,
    index: true
  },
  // Additional data based on notification type
  metadata: {
    reactionType: String, // For profile_reaction
    messageId: String, // For new_message or message_reaction
    requestId: String, // For friend_request
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Index for efficient queries
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, read: 1 });

// Auto-delete notifications older than 30 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 }); // 30 days

module.exports = mongoose.model('Notification', notificationSchema);
