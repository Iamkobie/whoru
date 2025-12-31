const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  description: {
    type: String,
    maxlength: 200
  },
  groupPicture: {
    type: String,
    default: null
  },
  groupPicturePublicId: {
    type: String
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['creator', 'admin', 'moderator', 'member'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    nickname: {
      type: String,
      maxlength: 30
    }
  }],
  settings: {
    isPublic: {
      type: Boolean,
      default: false
    },
    allowMemberInvites: {
      type: Boolean,
      default: true
    },
    requireApproval: {
      type: Boolean,
      default: false
    },
    maxMembers: {
      type: Number,
      default: 50,
      max: 200
    }
  },
  // 📝 Join Requests (for private groups)
  joinRequests: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    requestedAt: {
      type: Date,
      default: Date.now
    },
    message: {
      type: String,
      maxlength: 200
    }
  }],
  privacy: {
    type: String,
    enum: ['public', 'private'],
    default: 'public'
  },
  // 🎮 UNIQUE: Activity-based groups
  groupActivity: {
    type: String,
    enum: ['studying', 'gaming', 'watching', 'coding', 'music', 'fitness', 'cooking', 'chatting', 'other'],
    default: 'chatting'
  },
  // 🔥 UNIQUE: Live sessions for studying/gaming together
  liveSession: {
    isActive: {
      type: Boolean,
      default: false
    },
    startedAt: {
      type: Date
    },
    participants: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    sessionType: {
      type: String,
      enum: ['study', 'game', 'watch', 'code']
    },
    timer: {
      duration: Number, // in minutes
      startedAt: Date
    }
  },
  // 🎵 UNIQUE: Voice channel status
  voiceChannel: {
    isActive: {
      type: Boolean,
      default: false
    },
    participants: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      joinedAt: Date,
      isMuted: {
        type: Boolean,
        default: false
      }
    }]
  },
  // ⭐ UNIQUE: Group mood/vibe
  currentVibe: {
    type: String,
    enum: ['chill', 'focused', 'hype', 'chaos', 'peaceful', 'motivated'],
    default: 'chill'
  },
  // 📊 Engagement metrics
  lastActivity: {
    type: Date,
    default: Date.now
  },
  messageCount: {
    type: Number,
    default: 0
  },
  // 🏆 UNIQUE: Group achievements
  achievements: [{
    type: {
      type: String,
      enum: ['first_message', 'study_streak_7', 'night_owls', 'early_birds', 'super_active']
    },
    unlockedAt: Date,
    description: String
  }]
}, {
  timestamps: true
});

// Indexes
groupSchema.index({ creator: 1 });
groupSchema.index({ 'members.user': 1 });
groupSchema.index({ groupActivity: 1 });
groupSchema.index({ 'settings.isPublic': 1 });
groupSchema.index({ lastActivity: -1 });

// Virtual for member count
groupSchema.virtual('memberCount').get(function() {
  return this.members.length;
});

// Method to check if user is member
groupSchema.methods.isMember = function(userId) {
  return this.members.some(m => m.user.toString() === userId.toString());
};

// Method to check if user is admin
groupSchema.methods.isAdmin = function(userId) {
  return this.members.some(m => 
    m.user.toString() === userId.toString() && 
    (m.role === 'admin' || this.creator.toString() === userId.toString())
  );
};

module.exports = mongoose.model('Group', groupSchema);
