const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const GroupMessage = require('../models/GroupMessage');
const Group = require('../models/Group');

/**
 * @route   GET /api/group-messages/:groupId
 * @desc    Get messages for a group
 * @access  Private
 */
router.get('/:groupId', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Verify user is member
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const isMember = group.members.some(m => m.user.toString() === userId);
    if (!isMember) {
      return res.status(403).json({ message: 'Not a member of this group' });
    }

    // Get messages
    const messages = await GroupMessage.find({
      group: groupId,
      isDeleted: false
    })
      .populate('sender', '_id username profilePicture')
      .populate('replyTo', 'content sender')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    const total = await GroupMessage.countDocuments({
      group: groupId,
      isDeleted: false
    });

    res.json({
      messages: messages.reverse(), // Oldest first
      page,
      totalPages: Math.ceil(total / limit),
      totalMessages: total
    });
  } catch (error) {
    console.error('Get group messages error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   DELETE /api/group-messages/:messageId
 * @desc    Delete a group message
 * @access  Private
 */
router.delete('/:messageId', auth, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    const message = await GroupMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Check if user is sender or group admin
    const group = await Group.findById(message.group);
    const member = group.members.find(m => m.user.toString() === userId);
    const isAdmin = member && ['creator', 'admin', 'moderator'].includes(member.role);
    const isSender = message.sender.toString() === userId;

    if (!isSender && !isAdmin) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    message.isDeleted = true;
    message.deletedAt = new Date();
    await message.save();

    res.json({ message: 'Message deleted' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
