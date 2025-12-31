const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

/**
 * User Schema
 * Handles user authentication and friend relationships
 */
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [20, 'Username cannot exceed 20 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  otp: {
    type: String,
    default: null
  },
  otpExpiry: {
    type: Date,
    default: null
  },
  friends: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // ========== PROFILE SETUP FIELDS ==========
  profileCompleted: {
    type: Boolean,
    default: false
  },
  
  profileSetupStep: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  
  // BASIC INFO (Step 1)
  profilePicture: {
    type: String,
    default: null
  },
  
  bio: {
    type: String,
    minlength: 50,
    maxlength: 300,
    default: null
  },
  
  yearLevel: {
    type: String,
    enum: ['1st Year', '2nd Year', '3rd Year', '4th Year', 'Graduate', null],
    default: null
  },
  
  major: {
    type: String,
    default: null
  },
  
  // IDENTITY CARD DESIGN (Step 2)
  identityCard: {
    backgroundPattern: {
      type: String,
      enum: ['gradient1', 'gradient2', 'gradient3', 'pattern1', 'pattern2', 'mesh1', 'mesh2', 'aurora', 'sunset', 'ocean'],
      default: 'gradient1'
    },
    accentColor: {
      type: String,
      default: '#8B5CF6'
    },
    fontStyle: {
      type: String,
      enum: ['modern', 'classic', 'playful'],
      default: 'modern'
    },
    layout: {
      type: String,
      enum: ['minimal', 'detailed', 'creative'],
      default: 'minimal'
    }
  },
  
  // INTERESTS & VIBE (Step 3)
  interests: [{
    type: String,
    trim: true
  }],
  
  vibeTags: [{
    type: String,
    trim: true
  }],
  
  funFact: {
    type: String,
    maxlength: 100,
    default: null
  },
  
  // MATCHMAKING PREFERENCES (Step 4)
  matchPreferences: {
    sameYearLevel: { type: Boolean, default: false },
    sameMajor: { type: Boolean, default: false },
    similarInterests: { type: Boolean, default: true },
    anyone: { type: Boolean, default: true },
    chatStyle: {
      type: String,
      enum: ['deep', 'casual', 'friends', 'study', null],
      default: null
    }
  },
  
  // PRIVACY SETTINGS (Step 5)
  privacySettings: {
    showYearLevel: { type: Boolean, default: true },
    showMajor: { type: Boolean, default: true },
    allowMatchmaking: { type: Boolean, default: true },
    showOnlineStatus: { type: Boolean, default: true },
    showProfileViews: { type: Boolean, default: true }
  },
  
  // ========== FEATURED PHOTOS (NEW) ==========
  featuredPhotos: [{
    url: {
      type: String,
      required: true
    },
    publicId: {
      type: String,
      required: true
    },
    caption: {
      type: String,
      maxlength: 100,
      default: ''
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // ========== PROFILE VIEWS (NEW - ANONYMOUS) ==========
  profileViews: [{
    viewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    viewedAt: {
      type: Date,
      default: Date.now
    }
    // NO OTHER IDENTIFYING INFO - keeps it anonymous
  }],
  
  // ========== PROFILE REACTIONS (NEW) ==========
  profileReactions: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    reaction: {
      type: String,
      enum: ['like', 'love', 'cool', 'fire', 'star'],
      required: true
    },
    reactedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Index for faster profile view queries
userSchema.index({ 'profileViews.viewedAt': -1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to generate OTP
userSchema.methods.generateOTP = function() {
  const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
  this.otp = otp;
  this.otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes expiry
  return otp;
};

// Method to verify OTP
userSchema.methods.verifyOTP = function(otp) {
  if (!this.otp || !this.otpExpiry) return false;
  if (Date.now() > this.otpExpiry) return false;
  return this.otp === otp;
};

module.exports = mongoose.model('User', userSchema);
