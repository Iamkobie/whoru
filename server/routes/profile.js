const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/authMiddleware');
const multer = require('multer');
const { uploadImage } = require('../config/cloudinary');
const { createNotification } = require('../utils/notificationHelper');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files (JPEG, JPG, PNG, WebP) are allowed'));
  }
});

/**
 * @route   GET /api/profile/setup/status
 * @desc    Get profile setup status
 * @access  Private
 */
router.get('/setup/status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password -otp -otpExpiry');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({
      profileCompleted: user.profileCompleted,
      currentStep: user.profileSetupStep,
      progress: (user.profileSetupStep / 5) * 100,
      profile: {
        profilePicture: user.profilePicture,
        bio: user.bio,
        yearLevel: user.yearLevel,
        major: user.major,
        identityCard: user.identityCard,
        interests: user.interests,
        vibeTags: user.vibeTags,
        funFact: user.funFact,
        matchPreferences: user.matchPreferences,
        privacySettings: user.privacySettings
      }
    });
  } catch (error) {
    console.error('Get profile status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/profile/setup/step1
 * @desc    Save Step 1 - Basic Info
 * @access  Private
 */
router.post('/setup/step1', auth, async (req, res) => {
  try {
    const { bio, yearLevel, major } = req.body;
    
    // Validation
    if (!bio || bio.length < 50 || bio.length > 300) {
      return res.status(400).json({ message: 'Bio must be between 50-300 characters' });
    }
    
    if (!yearLevel || !major) {
      return res.status(400).json({ message: 'Year level and major are required' });
    }
    
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Update user
    user.bio = bio;
    user.yearLevel = yearLevel;
    user.major = major;
    user.profileSetupStep = Math.max(user.profileSetupStep, 1);
    
    await user.save();
    
    res.json({ 
      message: 'Step 1 completed successfully',
      currentStep: user.profileSetupStep,
      progress: (user.profileSetupStep / 5) * 100
    });
  } catch (error) {
    console.error('Step 1 error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/profile/setup/step2
 * @desc    Save Step 2 - Identity Card Design
 * @access  Private
 */
router.post('/setup/step2', auth, async (req, res) => {
  try {
    const { backgroundPattern, accentColor, fontStyle, layout } = req.body;
    
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Update identity card design
    user.identityCard = {
      backgroundPattern: backgroundPattern || user.identityCard.backgroundPattern,
      accentColor: accentColor || user.identityCard.accentColor,
      fontStyle: fontStyle || user.identityCard.fontStyle,
      layout: layout || user.identityCard.layout
    };
    
    user.profileSetupStep = Math.max(user.profileSetupStep, 2);
    
    await user.save();
    
    res.json({ 
      message: 'Step 2 completed successfully',
      currentStep: user.profileSetupStep,
      progress: (user.profileSetupStep / 5) * 100
    });
  } catch (error) {
    console.error('Step 2 error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/profile/setup/step3
 * @desc    Save Step 3 - Interests & Vibe
 * @access  Private
 */
router.post('/setup/step3', auth, async (req, res) => {
  try {
    const { interests, vibeTags, funFact } = req.body;
    
    // Validation
    if (!interests || interests.length < 5 || interests.length > 10) {
      return res.status(400).json({ message: 'Please select 5-10 interests' });
    }
    
    if (!vibeTags || vibeTags.length === 0 || vibeTags.length > 5) {
      return res.status(400).json({ message: 'Please select 1-5 vibe tags' });
    }
    
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    user.interests = interests;
    user.vibeTags = vibeTags;
    user.funFact = funFact || null;
    user.profileSetupStep = Math.max(user.profileSetupStep, 3);
    
    await user.save();
    
    res.json({ 
      message: 'Step 3 completed successfully',
      currentStep: user.profileSetupStep,
      progress: (user.profileSetupStep / 5) * 100
    });
  } catch (error) {
    console.error('Step 3 error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/profile/setup/step4
 * @desc    Save Step 4 - Match Preferences
 * @access  Private
 */
router.post('/setup/step4', auth, async (req, res) => {
  try {
    const { sameYearLevel, sameMajor, similarInterests, anyone, chatStyle } = req.body;
    
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    user.matchPreferences = {
      sameYearLevel: sameYearLevel || false,
      sameMajor: sameMajor || false,
      similarInterests: similarInterests !== undefined ? similarInterests : true,
      anyone: anyone !== undefined ? anyone : true,
      chatStyle: chatStyle || null
    };
    
    user.profileSetupStep = Math.max(user.profileSetupStep, 4);
    
    await user.save();
    
    res.json({ 
      message: 'Step 4 completed successfully',
      currentStep: user.profileSetupStep,
      progress: (user.profileSetupStep / 5) * 100
    });
  } catch (error) {
    console.error('Step 4 error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/profile/setup/step5
 * @desc    Save Step 5 - Privacy Settings & Complete Profile
 * @access  Private
 */
router.post('/setup/step5', auth, async (req, res) => {
  try {
    const { showYearLevel, showMajor, allowMatchmaking, showOnlineStatus } = req.body;
    
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if all required fields are filled
    if (!user.profilePicture || !user.bio || !user.yearLevel || !user.major) {
      return res.status(400).json({ message: 'Please complete all previous steps' });
    }
    
    if (!user.interests || user.interests.length < 5) {
      return res.status(400).json({ message: 'Please complete all previous steps' });
    }
    
    user.privacySettings = {
      showYearLevel: showYearLevel !== undefined ? showYearLevel : true,
      showMajor: showMajor !== undefined ? showMajor : true,
      allowMatchmaking: allowMatchmaking !== undefined ? allowMatchmaking : true,
      showOnlineStatus: showOnlineStatus !== undefined ? showOnlineStatus : true
    };
    
    user.profileSetupStep = 5;
    user.profileCompleted = true;
    
    await user.save();
    
    res.json({ 
      message: 'Profile setup completed! Welcome to WhoRU! 🎉',
      profileCompleted: true,
      currentStep: 5,
      progress: 100
    });
  } catch (error) {
    console.error('Step 5 error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/profile/upload-picture
 * @desc    Upload profile picture
 * @access  Private
 */
router.post('/upload-picture', auth, upload.single('profilePicture'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    // Upload to Cloudinary
    const result = await uploadImage(req.file.path, 'whoru/profiles');
    
    // Delete local file after upload
    fs.unlinkSync(req.file.path);
    
    // Update user
    const user = await User.findById(req.user.id);
    user.profilePicture = result.secure_url;
    await user.save();
    
    res.json({
      message: 'Profile picture uploaded successfully',
      profilePicture: result.secure_url
    });
  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up file if upload failed
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ message: 'Failed to upload image' });
  }
});

/**
 * @route   GET /api/profile/:userId
 * @desc    Get user profile
 * @access  Private
 */
router.get('/:userId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password -otp -otpExpiry');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if viewing own profile vs others'
    const isOwnProfile = req.user.id === req.params.userId;
    
    res.json({
      profile: {
        username: user.username,
        profilePicture: user.profilePicture,
        bio: user.bio,
        yearLevel: (isOwnProfile || user.privacySettings?.showYearLevel) ? user.yearLevel : null,
        major: (isOwnProfile || user.privacySettings?.showMajor) ? user.major : null,
        interests: user.interests || [],
        vibeTags: user.vibeTags || [],
        funFact: user.funFact,
        identityCard: user.identityCard || {},
        matchPreferences: isOwnProfile ? user.matchPreferences : null,
        privacySettings: isOwnProfile ? user.privacySettings : null,
        profileCompleted: user.profileCompleted || false,
        createdAt: user.createdAt,
        featuredPhotos: user.featuredPhotos || [],
        profileReactions: user.profileReactions || []
      },
      isOwnProfile
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================
// PROFILE VIEWS (ANONYMOUS)
// ============================

/**
 * @route   POST /api/profile/view/:userId
 * @desc    Track profile view (anonymous)
 * @access  Private
 */
router.post('/view/:userId', auth, async (req, res) => {
  try {
    const viewerId = req.user.id;
    const { userId } = req.params;

    // Don't track if viewing own profile
    if (viewerId === userId) {
      return res.json({ message: 'Own profile view not tracked' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if viewer already viewed in last 24 hours (prevent spam)
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentView = user.profileViews.find(
      view => view.viewerId.toString() === viewerId && view.viewedAt > last24Hours
    );

    if (!recentView) {
      // Add new view
      user.profileViews.push({
        viewerId,
        viewedAt: new Date()
      });
      await user.save();
    }

    res.json({ message: 'Profile view tracked' });
  } catch (error) {
    console.error('Track profile view error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/profile/views/analytics
 * @desc    Get profile view analytics (anonymous)
 * @access  Private
 */
router.get('/views/analytics', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).select('profileViews privacySettings');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check privacy settings
    if (!user.privacySettings.showProfileViews) {
      return res.json({
        enabled: false,
        message: 'Profile views are disabled in privacy settings'
      });
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Count views by time period
    const todayViews = user.profileViews.filter(v => v.viewedAt >= todayStart);
    const weekViews = user.profileViews.filter(v => v.viewedAt >= weekStart);
    const monthViews = user.profileViews.filter(v => v.viewedAt >= monthStart);

    // Get unique viewers (count unique IDs)
    const uniqueViewersToday = new Set(todayViews.map(v => v.viewerId.toString())).size;
    const uniqueViewersWeek = new Set(weekViews.map(v => v.viewerId.toString())).size;
    const uniqueViewersMonth = new Set(monthViews.map(v => v.viewerId.toString())).size;
    const uniqueViewersTotal = new Set(user.profileViews.map(v => v.viewerId.toString())).size;

    // Recent views (last 10, with time only - NO identity)
    const recentViews = user.profileViews
      .sort((a, b) => b.viewedAt - a.viewedAt)
      .slice(0, 10)
      .map(view => ({
        viewedAt: view.viewedAt
        // NO viewer info - keeps it anonymous
      }));

    res.json({
      enabled: true,
      analytics: {
        today: {
          total: todayViews.length,
          unique: uniqueViewersToday
        },
        thisWeek: {
          total: weekViews.length,
          unique: uniqueViewersWeek
        },
        thisMonth: {
          total: monthViews.length,
          unique: uniqueViewersMonth
        },
        allTime: {
          total: user.profileViews.length,
          unique: uniqueViewersTotal
        }
      },
      recentViews
    });
  } catch (error) {
    console.error('Get view analytics error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================
// FEATURED PHOTOS
// ============================

/**
 * @route   POST /api/profile/featured-photo
 * @desc    Upload featured photo
 * @access  Private
 */
router.post('/featured-photo', auth, upload.single('photo'), async (req, res) => {
  try {
    const userId = req.user.id;
    const { caption } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'No photo provided' });
    }

    const user = await User.findById(userId);
    if (!user) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: 'User not found' });
    }

    // Check limit (max 5 featured photos)
    if (user.featuredPhotos.length >= 5) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'Maximum 5 featured photos allowed. Delete one to add more.' });
    }

    // Upload to Cloudinary
    const result = await uploadImage(req.file.path, 'featured-photos');

    // Delete local file
    fs.unlinkSync(req.file.path);

    // Add to featured photos
    user.featuredPhotos.push({
      url: result.secure_url,
      publicId: result.public_id,
      caption: caption || '',
      uploadedAt: new Date()
    });

    await user.save();

    res.json({
      message: 'Featured photo uploaded',
      photo: user.featuredPhotos[user.featuredPhotos.length - 1]
    });
  } catch (error) {
    console.error('Upload featured photo error:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   DELETE /api/profile/featured-photo/:photoId
 * @desc    Delete featured photo
 * @access  Private
 */
router.delete('/featured-photo/:photoId', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { photoId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const photo = user.featuredPhotos.id(photoId);
    if (!photo) {
      return res.status(404).json({ message: 'Photo not found' });
    }

    // Delete from Cloudinary
    const cloudinary = require('../config/cloudinary').cloudinary;
    await cloudinary.uploader.destroy(photo.publicId);

    // Remove from array
    user.featuredPhotos.pull(photoId);
    await user.save();

    res.json({ message: 'Featured photo deleted' });
  } catch (error) {
    console.error('Delete featured photo error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   PATCH /api/profile/featured-photo/:photoId
 * @desc    Update featured photo caption
 * @access  Private
 */
router.patch('/featured-photo/:photoId', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { photoId } = req.params;
    const { caption } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const photo = user.featuredPhotos.id(photoId);
    if (!photo) {
      return res.status(404).json({ message: 'Photo not found' });
    }

    photo.caption = caption || '';
    await user.save();

    res.json({ message: 'Caption updated', photo });
  } catch (error) {
    console.error('Update caption error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================
// PROFILE REACTIONS
// ============================

/**
 * @route   POST /api/profile/react/:userId
 * @desc    Add reaction to profile
 * @access  Private
 */
router.post('/react/:userId', auth, async (req, res) => {
  try {
    const reactorId = req.user.id;
    const { userId } = req.params;
    const { reaction } = req.body;

    if (!['like', 'love', 'cool', 'fire', 'star'].includes(reaction)) {
      return res.status(400).json({ message: 'Invalid reaction' });
    }

    // Can't react to own profile
    if (reactorId === userId) {
      return res.status(400).json({ message: 'Cannot react to own profile' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if already reacted
    const existingReaction = user.profileReactions.find(
      r => r.userId.toString() === reactorId
    );

    if (existingReaction) {
      // Update reaction
      existingReaction.reaction = reaction;
      existingReaction.reactedAt = new Date();
    } else {
      // Add new reaction
      user.profileReactions.push({
        userId: reactorId,
        reaction,
        reactedAt: new Date()
      });
      
      // Create notification for new reaction (not for updates)
      const reactor = await User.findById(reactorId).select('username');
      const reactionEmojis = {
        like: '👍',
        love: '❤️',
        cool: '✨',
        fire: '🔥',
        star: '⭐'
      };
      
      await createNotification({
        recipient: userId,
        sender: reactorId,
        type: 'profile_reaction',
        message: `${reactor.username} reacted ${reactionEmojis[reaction]} to your profile`,
        link: `/profile/${reactorId}`,
        metadata: { reactionType: reaction }
      }, req.app.get('io'));
    }

    await user.save();

    res.json({ message: 'Reaction added', reaction });
  } catch (error) {
    console.error('Add reaction error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   DELETE /api/profile/react/:userId
 * @desc    Remove reaction from profile
 * @access  Private
 */
router.delete('/react/:userId', auth, async (req, res) => {
  try {
    const reactorId = req.user.id;
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.profileReactions = user.profileReactions.filter(
      r => r.userId.toString() !== reactorId
    );

    await user.save();

    res.json({ message: 'Reaction removed' });
  } catch (error) {
    console.error('Remove reaction error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/profile/reactions/:userId
 * @desc    Get profile reactions summary
 * @access  Private
 */
router.get('/reactions/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    const user = await User.findById(userId)
      .select('profileReactions')
      .populate('profileReactions.userId', 'username profilePicture');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Count reactions by type
    const reactionCounts = {
      like: 0,
      love: 0,
      cool: 0,
      fire: 0,
      star: 0
    };

    user.profileReactions.forEach(r => {
      reactionCounts[r.reaction]++;
    });

    // Check if current user reacted
    const userReaction = user.profileReactions.find(
      r => r.userId._id.toString() === currentUserId
    );

    res.json({
      counts: reactionCounts,
      total: user.profileReactions.length,
      userReaction: userReaction ? userReaction.reaction : null,
      // Only show reacting users if viewing own profile
      reactions: userId === currentUserId ? user.profileReactions.map(r => ({
        user: {
          id: r.userId._id,
          username: r.userId.username,
          profilePicture: r.userId.profilePicture
        },
        reaction: r.reaction,
        reactedAt: r.reactedAt
      })) : null
    });
  } catch (error) {
    console.error('Get reactions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
