const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const FriendRequest = require('../models/FriendRequest');
const authMiddleware = require('../middleware/authMiddleware');
const { createNotification } = require('../utils/notificationHelper');

/**
 * @route   GET /api/friends/search
 * @desc    Search users by username
 * @access  Private
 */
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({ 
        success: false, 
        message: 'Search query must be at least 2 characters' 
      });
    }

    // Search users (exclude self and existing friends)
    const users = await User.find({
      username: { $regex: query, $options: 'i' },
      _id: { 
        $ne: req.user._id,
        $nin: req.user.friends 
      },
      isVerified: true
    })
    .select('username email profilePicture bio major yearLevel createdAt')
    .limit(20);

    res.json({ 
      success: true, 
      users 
    });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while searching users' 
    });
  }
});

/**
 * @route   POST /api/friends/request
 * @desc    Send friend request
 * @access  Private
 */
router.post('/request', [
  authMiddleware,
  body('receiverId').notEmpty().withMessage('Receiver ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        message: errors.array()[0].msg 
      });
    }

    const { receiverId } = req.body;

    // Check if receiver exists
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Check if already friends
    if (req.user.friends.includes(receiverId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Already friends with this user' 
      });
    }

    // Check if request already exists
    const existingRequest = await FriendRequest.findOne({
      $or: [
        { sender: req.user._id, receiver: receiverId },
        { sender: receiverId, receiver: req.user._id }
      ],
      status: 'pending'
    });

    if (existingRequest) {
      return res.status(400).json({ 
        success: false, 
        message: 'Friend request already sent or received' 
      });
    }

    // Create friend request
    const friendRequest = new FriendRequest({
      sender: req.user._id,
      receiver: receiverId
    });

    await friendRequest.save();
    
    // Create notification for friend request
    const sender = await User.findById(req.user._id).select('username');
    await createNotification({
      recipient: receiverId,
      sender: req.user._id,
      type: 'friend_request',
      message: `${sender.username} sent you a friend request`,
      link: `/friends`,
      metadata: { requestId: friendRequest._id.toString() }
    }, req.app.get('io'));

    res.status(201).json({ 
      success: true, 
      message: 'Friend request sent successfully',
      friendRequest 
    });
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while sending friend request' 
    });
  }
});

/**
 * @route   GET /api/friends/requests
 * @desc    Get all pending friend requests (received)
 * @access  Private
 */
router.get('/requests', authMiddleware, async (req, res) => {
  try {
    const requests = await FriendRequest.find({
      receiver: req.user._id,
      status: 'pending'
    })
    .populate('sender', 'username email profilePicture createdAt')
    .sort({ createdAt: -1 });

    res.json({ 
      success: true, 
      requests 
    });
  } catch (error) {
    console.error('Get friend requests error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching friend requests' 
    });
  }
});

/**
 * @route   PUT /api/friends/request/:id/accept
 * @desc    Accept friend request
 * @access  Private
 */
router.put('/request/:id/accept', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const friendRequest = await FriendRequest.findById(id);
    
    if (!friendRequest) {
      return res.status(404).json({ 
        success: false, 
        message: 'Friend request not found' 
      });
    }

    // Verify receiver
    if (friendRequest.receiver.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to accept this request' 
      });
    }

    if (friendRequest.status !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        message: 'Request already processed' 
      });
    }

    // Update request status
    friendRequest.status = 'accepted';
    await friendRequest.save();

    // Add to friends list (both users)
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { friends: friendRequest.sender }
    });

    await User.findByIdAndUpdate(friendRequest.sender, {
      $addToSet: { friends: req.user._id }
    });
    
    // Create notification for accepted friend request
    const accepter = await User.findById(req.user._id).select('username');
    await createNotification({
      recipient: friendRequest.sender,
      sender: req.user._id,
      type: 'friend_accept',
      message: `${accepter.username} accepted your friend request`,
      link: `/profile/${req.user._id}`,
      metadata: { requestId: friendRequest._id.toString() }
    }, req.app.get('io'));

    res.json({ 
      success: true, 
      message: 'Friend request accepted!',
      friendRequest 
    });
  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while accepting friend request' 
    });
  }
});

/**
 * @route   PUT /api/friends/request/:id/decline
 * @desc    Decline friend request
 * @access  Private
 */
router.put('/request/:id/decline', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const friendRequest = await FriendRequest.findById(id);
    
    if (!friendRequest) {
      return res.status(404).json({ 
        success: false, 
        message: 'Friend request not found' 
      });
    }

    // Verify receiver
    if (friendRequest.receiver.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to decline this request' 
      });
    }

    if (friendRequest.status !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        message: 'Request already processed' 
      });
    }

    // Update request status
    friendRequest.status = 'declined';
    await friendRequest.save();

    res.json({ 
      success: true, 
      message: 'Friend request declined',
      friendRequest 
    });
  } catch (error) {
    console.error('Decline friend request error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while declining friend request' 
    });
  }
});

/**
 * @route   GET /api/friends
 * @desc    Get all friends
 * @access  Private
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('friends', 'username email profilePicture createdAt');

    res.json({ 
      success: true, 
      friends: user.friends 
    });
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching friends' 
    });
  }
});

module.exports = router;
