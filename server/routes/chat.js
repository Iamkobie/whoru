const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');

/**
 * @route   GET /api/chat/messages/:friendId
 * @desc    Get chat history with a friend
 * @access  Private
 */
router.get('/messages/:friendId', authMiddleware, async (req, res) => {
  try {
    const { friendId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Verify friend relationship
    if (!req.user.friends.includes(friendId)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not friends with this user' 
      });
    }

    // Get messages between user and friend
    const messages = await Message.find({
      $or: [
        { sender: req.user._id, receiver: friendId },
        { sender: friendId, receiver: req.user._id }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .populate('sender', 'username')
    .populate('receiver', 'username');

    // Reverse to show oldest first
    messages.reverse();

    // Count total messages
    const total = await Message.countDocuments({
      $or: [
        { sender: req.user._id, receiver: friendId },
        { sender: friendId, receiver: req.user._id }
      ]
    });

    res.json({ 
      success: true, 
      messages,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching messages' 
    });
  }
});

/**
 * @route   PUT /api/chat/messages/:messageId/read
 * @desc    Mark message as read
 * @access  Private
 */
router.put('/messages/:messageId/read', authMiddleware, async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ 
        success: false, 
        message: 'Message not found' 
      });
    }

    // Verify receiver
    if (message.receiver.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to mark this message as read' 
      });
    }

    message.read = true;
    await message.save();

    res.json({ 
      success: true, 
      message: 'Message marked as read',
      data: message 
    });
  } catch (error) {
    console.error('Mark message read error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while marking message as read' 
    });
  }
});

/**
 * @route   GET /api/chat/unread-count/:friendId
 * @desc    Get unread message count with a friend
 * @access  Private
 */
router.get('/unread-count/:friendId', authMiddleware, async (req, res) => {
  try {
    const { friendId } = req.params;

    const count = await Message.countDocuments({
      sender: friendId,
      receiver: req.user._id,
      read: false
    });

    res.json({ 
      success: true, 
      count 
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching unread count' 
    });
  }
});

module.exports = router;
