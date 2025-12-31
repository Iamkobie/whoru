const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // 🎮 Current activity status
  activityType: {
    type: String,
    enum: [
      'studying', 
      'gaming', 
      'watching', 
      'coding', 
      'listening',
      'exercising',
      'relaxing',
      'movie',
      'traveling',
      'shopping',
      'photography',
      'meditation',
      'working_out', 
      'cooking', 
      'reading', 
      'listening_music',
      'sleeping',
      'eating',
      'partying',
      'other'
    ],
    required: true
  },
  // Custom activity text
  customText: {
    type: String,
    maxlength: 100
  },
  // Activity emoji
  emoji: {
    type: String,
    default: '💭'
  },
  // 🔥 UNIQUE: Subject/details (e.g., "Calculus", "Valorant", "Breaking Bad")
  subject: {
    type: String,
    maxlength: 50
  },
  // 📍 UNIQUE: Location/place (optional)
  location: {
    type: String,
    maxlength: 50
  },
  // ⏱️ UNIQUE: Activity timer/duration
  timer: {
    startedAt: {
      type: Date,
      default: Date.now
    },
    duration: Number, // in minutes
    endTime: Date
  },
  // 👥 UNIQUE: Looking for companions
  lookingForCompany: {
    type: Boolean,
    default: false
  },
  // 💬 UNIQUE: Activity-specific status message
  statusMessage: {
    type: String,
    maxlength: 150
  },
  // 🎯 UNIQUE: Join requests from others
  joinRequests: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    message: String,
    requestedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // 👫 Current companions in activity
  companions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // 🔔 Activity notifications
  notifyOnMatch: {
    type: Boolean,
    default: true
  },
  // Privacy
  visibility: {
    type: String,
    enum: ['public', 'friends', 'private'],
    default: 'friends'
  },
  // Auto-end activity after 24 hours (expires)
  autoEndAt: {
    type: Date
  },
  // TTL index - auto delete after 24 hours
  expiresAt: {
    type: Date
  },
  // Activity ended
  isActive: {
    type: Boolean,
    default: true
  },
  endedAt: Date
}, {
  timestamps: true
});

// Indexes
activitySchema.index({ user: 1, isActive: 1 });
activitySchema.index({ activityType: 1, isActive: 1 });
activitySchema.index({ lookingForCompany: 1, isActive: 1 });
activitySchema.index({ autoEndAt: 1 });
activitySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index for auto-deletion
activitySchema.index({ subject: 1 });

// Set auto-end time to 24 hours from creation and TTL expiry
activitySchema.pre('save', function(next) {
  if (this.isNew) {
    const twentyFourHours = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    if (!this.autoEndAt) {
      this.autoEndAt = new Date(Date.now() + twentyFourHours);
    }
    if (!this.expiresAt) {
      this.expiresAt = new Date(Date.now() + twentyFourHours);
    }
  }
  next();
});

// Method to check if activity expired
activitySchema.methods.isExpired = function() {
  return this.autoEndAt && new Date() > this.autoEndAt;
};

// Method to end activity
activitySchema.methods.end = function() {
  this.isActive = false;
  this.endedAt = new Date();
  return this.save();
};

module.exports = mongoose.model('Activity', activitySchema);
