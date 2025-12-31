const mongoose = require('mongoose');

const storySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // 🎨 UNIQUE: Multiple content types in one story
  content: [{
    type: {
      type: String,
      enum: ['image', 'video', 'text', 'poll', 'mood', 'music', 'challenge'],
      required: true
    },
    // Media content
    mediaUrl: String,
    mediaPublicId: String,
    thumbnail: String,
    
    // Text content
    text: String,
    textStyle: {
      fontSize: {
        type: String,
        enum: ['small', 'medium', 'large'],
        default: 'medium'
      },
      backgroundColor: String,
      textColor: String,
      fontFamily: String
    },
    
    // 📊 UNIQUE: Interactive poll
    poll: {
      question: String,
      options: [{
        text: String,
        votes: [{
          user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
          },
          votedAt: Date
        }]
      }]
    },
    
    // 😊 UNIQUE: Mood sharing with activity
    mood: {
      emoji: String,
      feeling: String,
      activity: String, // "studying for finals", "gaming", etc.
      color: String
    },
    
    // 🎵 UNIQUE: Music sharing
    music: {
      songName: String,
      artist: String,
      albumArt: String,
      spotifyLink: String
    },
    
    // 🎯 UNIQUE: Challenge (like "post your setup", "show your notes")
    challenge: {
      title: String,
      description: String,
      icon: String,
      responses: [{
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        responseUrl: String,
        responseText: String,
        respondedAt: Date
      }]
    }
  }],
  
  // 🔥 UNIQUE: Story reactions with emojis
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    emoji: {
      type: String,
      required: true
    },
    reactedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // 💬 Quick replies (swipe up responses)
  replies: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    message: String,
    repliedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // 👀 View tracking (anonymous)
  views: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    viewedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Privacy settings
  visibility: {
    type: String,
    enum: ['public', 'friends', 'close_friends', 'specific'],
    default: 'friends'
  },
  specificViewers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Story expiration (24 hours default)
  expiresAt: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

// TTL index - auto-delete after expiration
storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Indexes
storySchema.index({ user: 1, createdAt: -1 });
storySchema.index({ 'views.user': 1 });

// Virtual for view count
storySchema.virtual('viewCount').get(function() {
  return this.views.length;
});

// Virtual for reaction count
storySchema.virtual('reactionCount').get(function() {
  return this.reactions.length;
});

// Set expiration to 24 hours from creation
storySchema.pre('save', function(next) {
  if (this.isNew && !this.expiresAt) {
    this.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  }
  next();
});

module.exports = mongoose.model('Story', storySchema);
