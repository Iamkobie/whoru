const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const auth = require('../middleware/authMiddleware');

/**
 * @route   GET /api/notifications
 * @desc    Get all notifications for current user
 * @access  Private
 */
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const notifications = await Notification.find({ recipient: userId })
      .populate('sender', 'username profilePicture')
      .sort({ createdAt: -1 })
      .limit(50); // Last 50 notifications

    res.json(notifications);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Get count of unread notifications
 * @access  Private
 */
router.get('/unread-count', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const count = await Notification.countDocuments({
      recipient: userId,
      read: false
    });

    res.json({ count });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   PATCH /api/notifications/:notificationId/read
 * @desc    Mark notification as read
 * @access  Private
 */
router.patch('/:notificationId/read', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { notificationId } = req.params;

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipient: userId },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json(notification);
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   PATCH /api/notifications/mark-all-read
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.patch('/mark-all-read', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    await Notification.updateMany(
      { recipient: userId, read: false },
      { read: true }
    );

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   DELETE /api/notifications/:notificationId
 * @desc    Delete a notification
 * @access  Private
 */
router.delete('/:notificationId', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { notificationId } = req.params;

    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      recipient: userId
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   DELETE /api/notifications
 * @desc    Delete all notifications
 * @access  Private
 */
router.delete('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    await Notification.deleteMany({ recipient: userId });

    res.json({ message: 'All notifications deleted' });
  } catch (error) {
    console.error('Delete all notifications error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
