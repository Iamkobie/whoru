const express = require('express');
const router = express.Router();
const Activity = require('../models/Activity');
const User = require('../models/User');
const auth = require('../middleware/authMiddleware');
const { createNotification } = require('../utils/notificationHelper');

/**
 * @route   POST /api/activities
 * @desc    Set current activity (UNIQUE: Real-time activity matching)
 * @access  Private
 */
router.post('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      activityType,
      customText,
      emoji,
      subject,
      location,
      duration,
      lookingForCompany,
      statusMessage,
      visibility
    } = req.body;

    // End any existing active activity
    await Activity.updateMany(
      { user: userId, isActive: true },
      { $set: { isActive: false, endedAt: new Date() } }
    );

    // Create new activity
    const activity = new Activity({
      user: userId,
      activityType,
      customText,
      emoji,
      subject,
      location,
      lookingForCompany: lookingForCompany || false,
      statusMessage,
      visibility: visibility || 'friends',
      autoEndAt: new Date(Date.now() + (duration || 240) * 60 * 1000) // default 4 hours
    });

    if (duration) {
      activity.timer = {
        startedAt: new Date(),
        duration,
        endTime: new Date(Date.now() + duration * 60 * 1000)
      };
    }

    await activity.save();
    await activity.populate('user', 'username profilePicture');

    // 🔥 UNIQUE: Find and notify users doing the same activity
    if (lookingForCompany) {
      const user = await User.findById(userId);
      const friendIds = user.friends || [];

      const matchingActivities = await Activity.find({
        user: { $in: friendIds },
        activityType,
        subject: subject || null,
        lookingForCompany: true,
        isActive: true,
        _id: { $ne: activity._id }
      }).populate('user', 'username profilePicture');

      // Notify matching users
      const io = req.app.get('io');
      for (const match of matchingActivities) {
        await createNotification({
          recipient: match.user._id,
          sender: userId,
          type: 'activity_match',
          message: `${user.username} is also ${activityType}${subject ? ` ${subject}` : ''}! 🎯`,
          link: `/activities/${activity._id}`
        }, io);

        // Real-time notification
        io.to(match.user._id.toString()).emit('activity_match', {
          activityId: activity._id,
          user: {
            _id: user._id,
            username: user.username,
            profilePicture: user.profilePicture
          },
          activityType,
          subject
        });
      }
    }

    res.status(201).json(activity);
  } catch (error) {
    console.error('Create activity error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/activities
 * @desc    Get friends' current activities
 * @access  Private
 */
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's friends
    const user = await User.findById(userId).select('friends');
    const friendIds = user.friends || [];

    // Get active activities from friends
    const activities = await Activity.find({
      user: { $in: [...friendIds, userId] },
      isActive: true,
      autoEndAt: { $gt: new Date() }
    })
      .populate('user', 'username profilePicture')
      .populate('companions.user', 'username profilePicture')
      .sort({ createdAt: -1 });

    res.json(activities);
  } catch (error) {
    console.error('Get activities error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/activities/discover
 * @desc    Discover activities (UNIQUE: Find people doing the same thing)
 * @access  Private
 */
router.get('/discover', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { activityType, subject, lookingForCompany } = req.query;

    // Get user's friends
    const user = await User.findById(userId).select('friends');
    const friendIds = user.friends || [];

    let query = {
      user: { $in: friendIds, $ne: userId },
      isActive: true,
      autoEndAt: { $gt: new Date() },
      visibility: { $in: ['public', 'friends'] }
    };

    if (activityType) {
      query.activityType = activityType;
    }

    if (subject) {
      query.subject = new RegExp(subject, 'i');
    }

    if (lookingForCompany === 'true') {
      query.lookingForCompany = true;
    }

    const activities = await Activity.find(query)
      .populate('user', 'username profilePicture')
      .populate('companions.user', 'username profilePicture')
      .sort({ createdAt: -1 })
      .limit(50);

    // Group by activity type
    const grouped = {};
    activities.forEach(activity => {
      const type = activity.activityType;
      if (!grouped[type]) {
        grouped[type] = {
          activityType: type,
          count: 0,
          activities: []
        };
      }
      grouped[type].count++;
      grouped[type].activities.push(activity);
    });

    res.json({
      activities,
      grouped: Object.values(grouped)
    });
  } catch (error) {
    console.error('Discover activities error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/activities/:activityId
 * @desc    Get activity details
 * @access  Private
 */
router.get('/:activityId', auth, async (req, res) => {
  try {
    const { activityId } = req.params;

    const activity = await Activity.findById(activityId)
      .populate('user', 'username profilePicture')
      .populate('companions.user', 'username profilePicture')
      .populate('joinRequests.user', 'username profilePicture');

    if (!activity) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    res.json(activity);
  } catch (error) {
    console.error('Get activity error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/activities/:activityId/join-request
 * @desc    Request to join someone's activity (UNIQUE FEATURE)
 * @access  Private
 */
router.post('/:activityId/join-request', auth, async (req, res) => {
  try {
    const { activityId } = req.params;
    const userId = req.user.id;
    const { message } = req.body;

    const activity = await Activity.findById(activityId);

    if (!activity) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    if (!activity.lookingForCompany) {
      return res.status(400).json({ message: 'Not looking for company' });
    }

    if (activity.user.toString() === userId) {
      return res.status(400).json({ message: 'Cannot join your own activity' });
    }

    // Check if already requested
    const alreadyRequested = activity.joinRequests.some(
      req => req.user.toString() === userId
    );

    if (alreadyRequested) {
      return res.status(400).json({ message: 'Already requested' });
    }

    // Add join request
    activity.joinRequests.push({
      user: userId,
      message: message || '',
      requestedAt: new Date()
    });

    await activity.save();
    await activity.populate('joinRequests.user', 'username profilePicture');

    // Notify activity owner
    const requester = await User.findById(userId);
    await createNotification({
      recipient: activity.user,
      sender: userId,
      type: 'activity_join_request',
      message: `${requester.username} wants to ${activity.activityType} with you! ${activity.emoji}`,
      link: `/activities/${activityId}`
    }, req.app.get('io'));

    res.json(activity.joinRequests);
  } catch (error) {
    console.error('Join request error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/activities/:activityId/accept-request/:requestUserId
 * @desc    Accept join request
 * @access  Private
 */
router.post('/:activityId/accept-request/:requestUserId', auth, async (req, res) => {
  try {
    const { activityId, requestUserId } = req.params;
    const userId = req.user.id;

    const activity = await Activity.findById(activityId);

    if (!activity) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    if (activity.user.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Remove join request
    activity.joinRequests = activity.joinRequests.filter(
      req => req.user.toString() !== requestUserId
    );

    // Add to companions
    activity.companions.push({
      user: requestUserId,
      joinedAt: new Date()
    });

    await activity.save();
    await activity.populate('companions.user', 'username profilePicture');

    // Notify requester
    const owner = await User.findById(userId);
    await createNotification({
      recipient: requestUserId,
      sender: userId,
      type: 'activity_request_accepted',
      message: `${owner.username} accepted your request to ${activity.activityType} together! 🎉`,
      link: `/activities/${activityId}`
    }, req.app.get('io'));

    res.json(activity.companions);
  } catch (error) {
    console.error('Accept request error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/activities/:activityId/end
 * @desc    End activity
 * @access  Private
 */
router.post('/:activityId/end', auth, async (req, res) => {
  try {
    const { activityId } = req.params;
    const userId = req.user.id;

    const activity = await Activity.findById(activityId);

    if (!activity) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    if (activity.user.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await activity.end();

    res.json({ message: 'Activity ended' });
  } catch (error) {
    console.error('End activity error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/activities/stats/popular
 * @desc    Get popular activities right now (UNIQUE: Social discovery)
 * @access  Private
 */
router.get('/stats/popular', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user's friends
    const user = await User.findById(userId).select('friends');
    const friendIds = user.friends || [];

    // Aggregate popular activities among friends
    const popularActivities = await Activity.aggregate([
      {
        $match: {
          user: { $in: friendIds },
          isActive: true,
          autoEndAt: { $gt: new Date() }
        }
      },
      {
        $group: {
          _id: '$activityType',
          count: { $sum: 1 },
          subjects: { $addToSet: '$subject' },
          users: { $addToSet: '$user' }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      }
    ]);

    // Get trending subjects
    const trendingSubjects = await Activity.aggregate([
      {
        $match: {
          user: { $in: friendIds },
          isActive: true,
          subject: { $ne: null },
          autoEndAt: { $gt: new Date() }
        }
      },
      {
        $group: {
          _id: '$subject',
          count: { $sum: 1 },
          activityType: { $first: '$activityType' }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 5
      }
    ]);

    res.json({
      popularActivities,
      trendingSubjects,
      totalActive: friendIds.length > 0 ? await Activity.countDocuments({
        user: { $in: friendIds },
        isActive: true,
        autoEndAt: { $gt: new Date() }
      }) : 0
    });
  } catch (error) {
    console.error('Get popular activities error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   DELETE /api/activities/:activityId
 * @desc    Delete activity
 * @access  Private
 */
router.delete('/:activityId', auth, async (req, res) => {
  try {
    const { activityId } = req.params;
    const userId = req.user.id;

    const activity = await Activity.findById(activityId);

    if (!activity) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    if (activity.user.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await activity.deleteOne();

    res.json({ message: 'Activity deleted' });
  } catch (error) {
    console.error('Delete activity error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
