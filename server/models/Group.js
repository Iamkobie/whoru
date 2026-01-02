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
  // 💌 Group Invitations
  invitations: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    invitedAt: {
      type: Date,
      default: Date.now
    },
    message: {
      type: String,
      maxlength: 200
    }
  }],
  // 🚫 Banned Members
  bannedMembers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    bannedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    bannedAt: {
      type: Date,
      default: Date.now
    },
    reason: {
      type: String,
      maxlength: 200
    }
  }],
  // 🔇 Muted Members
  mutedMembers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    mutedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    mutedAt: {
      type: Date,
      default: Date.now
    },
    mutedUntil: {
      type: Date
    },
    reason: {
      type: String,
      maxlength: 200
    }
  }],
  // 📜 Group Rules
  rules: [{
    text: {
      type: String,
      maxlength: 300,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  // 📢 Announcements (pinned by admins)
  announcements: [{
    text: {
      type: String,
      maxlength: 500,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    isPinned: {
      type: Boolean,
      default: true
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

// Method to check if user is admin (creator or admin role)
groupSchema.methods.isAdmin = function(userId) {
  return this.members.some(m => 
    m.user.toString() === userId.toString() && 
    (m.role === 'admin' || m.role === 'creator')
  );
};

// PHASE 3: Comprehensive permission methods
// Method to check if user is owner/creator
groupSchema.methods.isOwner = function(userId) {
  return this.creator.toString() === userId.toString();
};

// Method to check if user is moderator or higher
groupSchema.methods.isModerator = function(userId) {
  const member = this.members.find(m => m.user.toString() === userId.toString());
  if (!member) return false;
  return ['creator', 'admin', 'moderator'].includes(member.role);
};

// Method to get user's role
groupSchema.methods.getUserRole = function(userId) {
  const member = this.members.find(m => m.user.toString() === userId.toString());
  return member ? member.role : null;
};

// Method to check if user can ban/remove another user
// Rules: Owner can ban anyone, Admin can ban moderators/members, Moderator can ban members only
groupSchema.methods.canBanUser = function(adminId, targetId) {
  const adminMember = this.members.find(m => m.user.toString() === adminId.toString());
  const targetMember = this.members.find(m => m.user.toString() === targetId.toString());
  
  if (!adminMember || !targetMember) return false;
  if (adminMember.user.toString() === targetMember.user.toString()) return false; // Can't ban self
  
  const adminRole = adminMember.role;
  const targetRole = targetMember.role;
  
  // Owner can ban anyone except themselves
  if (adminRole === 'creator') return true;
  
  // Admin can ban moderators and members
  if (adminRole === 'admin') {
    return ['moderator', 'member'].includes(targetRole);
  }
  
  // Moderator can only ban members
  if (adminRole === 'moderator') {
    return targetRole === 'member';
  }
  
  return false;
};

// Method to check if user can modify group settings
groupSchema.methods.canModifySettings = function(userId) {
  return this.isOwner(userId);
};

// Method to check if user can create announcements
groupSchema.methods.canCreateAnnouncement = function(userId) {
  return this.isAdmin(userId);
};

// Method to check if user can modify rules
groupSchema.methods.canModifyRules = function(userId) {
  return this.isAdmin(userId);
};

// Method to check if user can change roles
groupSchema.methods.canChangeRole = function(adminId, targetId, newRole) {
  if (!this.isOwner(adminId)) return false; // Only owner can change roles
  if (adminId.toString() === targetId.toString()) return false; // Can't change own role
  const targetMember = this.members.find(m => m.user.toString() === targetId.toString());
  if (!targetMember) return false;
  if (targetMember.role === 'creator') return false; // Can't change creator role
  return true;
};

module.exports = mongoose.model('Group', groupSchema);
