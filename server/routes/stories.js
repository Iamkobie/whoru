const express = require('express');
const router = express.Router();
const Story = require('../models/Story');
const User = require('../models/User');
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { cloudinary } = require('../config/cloudinary');
const { createNotification } = require('../utils/notificationHelper');

/**
 * @route   POST /api/stories
 * @desc    Create a new story
 * @access  Private
 */
router.post('/', auth, upload.single('media'), async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, text, textStyle, visibility, poll, mood, music, challenge } = req.body;

    let contentItem = {
      type: type || 'text'
    };

    // Handle media upload
    if (req.file && (type === 'image' || type === 'video')) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'whoru/stories',
        resource_type: type === 'video' ? 'video' : 'image'
      });
      contentItem.mediaUrl = result.secure_url;
      contentItem.mediaPublicId = result.public_id;

      // Generate thumbnail for videos
      if (type === 'video') {
        contentItem.thumbnail = result.secure_url.replace('/upload/', '/upload/w_400,h_400,c_fill/');
      }
    }

    // Handle different content types
    if (type === 'text' && text) {
      contentItem.text = text;
      contentItem.textStyle = textStyle ? JSON.parse(textStyle) : {};
    }

    // 📊 UNIQUE: Interactive poll
    if (type === 'poll' && poll) {
      const pollData = typeof poll === 'string' ? JSON.parse(poll) : poll;
      contentItem.poll = {
        question: pollData.question,
        options: pollData.options.map(opt => ({ text: opt, votes: [] }))
      };
    }

    // 😊 UNIQUE: Mood sharing
    if (type === 'mood' && mood) {
      const moodData = typeof mood === 'string' ? JSON.parse(mood) : mood;
      contentItem.mood = moodData;
    }

    // 🎵 UNIQUE: Music sharing
    if (type === 'music' && music) {
      const musicData = typeof music === 'string' ? JSON.parse(music) : music;
      contentItem.music = musicData;
    }

    // 🎯 UNIQUE: Challenge
    if (type === 'challenge' && challenge) {
      const challengeData = typeof challenge === 'string' ? JSON.parse(challenge) : challenge;
      contentItem.challenge = {
        title: challengeData.title,
        description: challengeData.description,
        icon: challengeData.icon,
        responses: []
      };
    }

    // Create story
    const story = new Story({
      user: userId,
      content: [contentItem],
      visibility: visibility || 'friends',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    });

    await story.save();
    await story.populate('user', 'username profilePicture');

    // Notify friends about new story
    const user = await User.findById(userId).populate('friends', '_id');
    const io = req.app.get('io');

    for (const friend of user.friends) {
      io.to(friend._id.toString()).emit('new_story', {
        userId,
        username: user.username,
        profilePicture: user.profilePicture
      });
    }

    res.status(201).json(story);
  } catch (error) {
    console.error('Create story error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/stories
 * @desc    Get stories from friends (feed)
 * @access  Private
 */
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's friends
    const user = await User.findById(userId).select('friends');
    const friendIds = user.friends || [];

    // Get stories from friends and self
    const stories = await Story.find({
      user: { $in: [...friendIds, userId] },
      expiresAt: { $gt: new Date() }
    })
      .populate('user', 'username profilePicture')
      .populate('reactions.user', 'username profilePicture')
      .populate('replies.user', 'username profilePicture')
      .sort({ createdAt: -1 });

    // Group by user (latest story per user)
    const groupedStories = {};
    stories.forEach(story => {
      const userIdKey = story.user._id.toString();
      if (!groupedStories[userIdKey]) {
        groupedStories[userIdKey] = {
          user: story.user,
          stories: [],
          hasUnseen: !story.views.some(v => v.user.toString() === userId)
        };
      }
      groupedStories[userIdKey].stories.push(story);
    });

    res.json(Object.values(groupedStories));
  } catch (error) {
    console.error('Get stories error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/stories/user/:userId
 * @desc    Get specific user's stories
 * @access  Private
 */
router.get('/user/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;

    const stories = await Story.find({
      user: userId,
      expiresAt: { $gt: new Date() }
    })
      .populate('user', 'username profilePicture')
      .populate('reactions.user', 'username profilePicture')
      .populate('views.user', 'username profilePicture')
      .sort({ createdAt: -1 });

    res.json(stories);
  } catch (error) {
    console.error('Get user stories error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/stories/:storyId/view
 * @desc    Mark story as viewed
 * @access  Private
 */
router.post('/:storyId/view', auth, async (req, res) => {
  try {
    const { storyId } = req.params;
    const userId = req.user.id;

    const story = await Story.findById(storyId);

    if (!story) {
      return res.status(404).json({ message: 'Story not found' });
    }

    // Check if already viewed
    const alreadyViewed = story.views.some(v => v.user.toString() === userId);

    if (!alreadyViewed) {
      story.views.push({
        user: userId,
        viewedAt: new Date()
      });
      await story.save();

      // Notify story owner (if not self)
      if (story.user.toString() !== userId) {
        const viewer = await User.findById(userId);
        const io = req.app.get('io');
        io.to(story.user.toString()).emit('story_viewed', {
          storyId,
          viewerUsername: viewer.username,
          viewerProfilePicture: viewer.profilePicture
        });
      }
    }

    res.json({ message: 'Story viewed' });
  } catch (error) {
    console.error('View story error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/stories/:storyId/react
 * @desc    React to story (UNIQUE: Multiple emoji reactions)
 * @access  Private
 */
router.post('/:storyId/react', auth, async (req, res) => {
  try {
    const { storyId } = req.params;
    const userId = req.user.id;
    const { emoji } = req.body;

    const story = await Story.findById(storyId);

    if (!story) {
      return res.status(404).json({ message: 'Story not found' });
    }

    // Remove existing reaction from this user
    story.reactions = story.reactions.filter(r => r.user.toString() !== userId);

    // Add new reaction
    story.reactions.push({
      user: userId,
      emoji,
      reactedAt: new Date()
    });

    await story.save();
    await story.populate('reactions.user', 'username profilePicture');

    // Notify story owner
    if (story.user.toString() !== userId) {
      const reactor = await User.findById(userId);
      await createNotification({
        recipient: story.user,
        sender: userId,
        type: 'story_reaction',
        message: `${reactor.username} reacted ${emoji} to your story`,
        link: `/stories/${storyId}`
      }, req.app.get('io'));
    }

    res.json(story.reactions);
  } catch (error) {
    console.error('React to story error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/stories/:storyId/reply
 * @desc    Reply to story (swipe up)
 * @access  Private
 */
router.post('/:storyId/reply', auth, async (req, res) => {
  try {
    const { storyId } = req.params;
    const userId = req.user.id;
    const { message } = req.body;

    const story = await Story.findById(storyId);

    if (!story) {
      return res.status(404).json({ message: 'Story not found' });
    }

    story.replies.push({
      user: userId,
      message,
      repliedAt: new Date()
    });

    await story.save();
    await story.populate('replies.user', 'username profilePicture');

    // Notify story owner
    if (story.user.toString() !== userId) {
      const replier = await User.findById(userId);
      await createNotification({
        recipient: story.user,
        sender: userId,
        type: 'story_reply',
        message: `${replier.username} replied to your story`,
        link: `/stories/${storyId}`
      }, req.app.get('io'));
    }

    res.json(story.replies);
  } catch (error) {
    console.error('Reply to story error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/stories/:storyId/poll/vote
 * @desc    Vote on story poll (UNIQUE FEATURE)
 * @access  Private
 */
router.post('/:storyId/poll/vote', auth, async (req, res) => {
  try {
    const { storyId } = req.params;
    const userId = req.user.id;
    const { optionIndex } = req.body;

    const story = await Story.findById(storyId);

    if (!story) {
      return res.status(404).json({ message: 'Story not found' });
    }

    // Find poll content
    const pollContent = story.content.find(c => c.type === 'poll');

    if (!pollContent || !pollContent.poll) {
      return res.status(400).json({ message: 'No poll in this story' });
    }

    // Remove existing vote
    pollContent.poll.options.forEach(opt => {
      opt.votes = opt.votes.filter(v => v.user.toString() !== userId);
    });

    // Add new vote
    if (optionIndex >= 0 && optionIndex < pollContent.poll.options.length) {
      pollContent.poll.options[optionIndex].votes.push({
        user: userId,
        votedAt: new Date()
      });
    }

    await story.save();

    // Calculate percentages
    const totalVotes = pollContent.poll.options.reduce((sum, opt) => sum + opt.votes.length, 0);
    const results = pollContent.poll.options.map(opt => ({
      text: opt.text,
      votes: opt.votes.length,
      percentage: totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0
    }));

    res.json({ results });
  } catch (error) {
    console.error('Vote on poll error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/stories/:storyId/challenge/respond
 * @desc    Respond to story challenge (UNIQUE FEATURE)
 * @access  Private
 */
router.post('/:storyId/challenge/respond', auth, upload.single('response'), async (req, res) => {
  try {
    const { storyId } = req.params;
    const userId = req.user.id;
    const { responseText } = req.body;

    const story = await Story.findById(storyId);

    if (!story) {
      return res.status(404).json({ message: 'Story not found' });
    }

    // Find challenge content
    const challengeContent = story.content.find(c => c.type === 'challenge');

    if (!challengeContent || !challengeContent.challenge) {
      return res.status(400).json({ message: 'No challenge in this story' });
    }

    let responseUrl = null;

    // Upload response media if provided
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'whoru/challenge-responses'
      });
      responseUrl = result.secure_url;
    }

    // Add response
    challengeContent.challenge.responses.push({
      user: userId,
      responseUrl,
      responseText,
      respondedAt: new Date()
    });

    await story.save();
    await story.populate('content.challenge.responses.user', 'username profilePicture');

    // Notify challenge creator
    if (story.user.toString() !== userId) {
      const responder = await User.findById(userId);
      await createNotification({
        recipient: story.user,
        sender: userId,
        type: 'challenge_response',
        message: `${responder.username} responded to your challenge!`,
        link: `/stories/${storyId}`
      }, req.app.get('io'));
    }

    res.json(challengeContent.challenge.responses);
  } catch (error) {
    console.error('Respond to challenge error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   DELETE /api/stories/:storyId
 * @desc    Delete story
 * @access  Private
 */
router.delete('/:storyId', auth, async (req, res) => {
  try {
    const { storyId } = req.params;
    const userId = req.user.id;

    const story = await Story.findById(storyId);

    if (!story) {
      return res.status(404).json({ message: 'Story not found' });
    }

    if (story.user.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Delete media from Cloudinary
    for (const content of story.content) {
      if (content.mediaPublicId) {
        await cloudinary.uploader.destroy(content.mediaPublicId);
      }
    }

    await story.deleteOne();

    res.json({ message: 'Story deleted' });
  } catch (error) {
    console.error('Delete story error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
