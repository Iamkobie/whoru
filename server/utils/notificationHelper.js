const Notification = require('../models/Notification');

/**
 * Create a notification and optionally emit via Socket.io
 * @param {Object} data - Notification data
 * @param {string} data.recipient - User ID of recipient
 * @param {string} data.sender - User ID of sender
 * @param {string} data.type - Notification type
 * @param {string} data.message - Notification message
 * @param {string} data.link - Optional link to navigate to
 * @param {Object} data.metadata - Optional additional data
 * @param {Object} io - Socket.io instance (optional)
 * @returns {Promise<Notification>}
 */
const createNotification = async (data, io = null) => {
  try {
    const { recipient, sender, type, message, link, metadata } = data;

    // Validate required fields
    if (!recipient) {
      console.error('❌ Notification error: recipient is required');
      return null;
    }

    // Don't create notification if recipient is sender
    if (sender && recipient.toString() === sender.toString()) {
      return null;
    }

    const notification = new Notification({
      recipient,
      sender: sender || null,
      type,
      message,
      link: link || null,
      metadata: metadata || {}
    });

    await notification.save();

    // Populate sender info
    await notification.populate('sender', 'username profilePicture');

    // Emit real-time notification if Socket.io instance provided
    if (io) {
      io.to(recipient.toString()).emit('new_notification', notification);
    }

    return notification;
  } catch (error) {
    console.error('Create notification error:', error);
    throw error;
  }
};

/**
 * Delete notifications by criteria
 * @param {Object} criteria - MongoDB query criteria
 */
const deleteNotifications = async (criteria) => {
  try {
    await Notification.deleteMany(criteria);
  } catch (error) {
    console.error('Delete notifications error:', error);
  }
};

module.exports = {
  createNotification,
  deleteNotifications
};
