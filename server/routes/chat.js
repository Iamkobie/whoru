const express = require('express');
const router = express.Router();
const multer = require('multer');
const Message = require('../models/Message');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');
const { uploadImage, uploadVideo, uploadAudio, deleteFile } = require('../config/cloudinary');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  limits: { 
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

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
    .populate('sender', 'username profilePicture')
    .populate('receiver', 'username profilePicture');

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

/**
 * @route   POST /api/chat/upload-image
 * @desc    Upload image to chat
 * @access  Private
 */
router.post('/upload-image', [authMiddleware, upload.single('image')], async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No image file provided' 
      });
    }

    const { receiverId, caption } = req.body;

    // Verify friend relationship
    if (!req.user.friends.includes(receiverId)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not friends with this user' 
      });
    }

    // Upload to Cloudinary
    const result = await uploadImage(req.file.path, 'chat-images');

    // Create message
    const message = new Message({
      sender: req.user._id,
      receiver: receiverId,
      content: caption || '',
      messageType: 'image',
      mediaUrl: result.secure_url,
      mediaPublicId: result.public_id,
      mediaThumbnail: result.secure_url
    });

    await message.save();
    await message.populate('sender', 'username profilePicture');
    await message.populate('receiver', 'username profilePicture');

    // Delete local file
    const fs = require('fs');
    fs.unlinkSync(req.file.path);

    res.json({ 
      success: true, 
      message: 'Image uploaded successfully',
      data: message 
    });
  } catch (error) {
    console.error('Upload image error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while uploading image' 
    });
  }
});

/**
 * @route   POST /api/chat/upload-video
 * @desc    Upload video to chat
 * @access  Private
 */
router.post('/upload-video', [authMiddleware, upload.single('video')], async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No video file provided' 
      });
    }

    const { receiverId, caption } = req.body;

    // Verify friend relationship
    if (!req.user.friends.includes(receiverId)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not friends with this user' 
      });
    }

    // Upload to Cloudinary
    const result = await uploadVideo(req.file.path, 'chat-videos');

    // Create message
    const message = new Message({
      sender: req.user._id,
      receiver: receiverId,
      content: caption || '',
      messageType: 'video',
      mediaUrl: result.secure_url,
      mediaPublicId: result.public_id,
      mediaThumbnail: result.thumbnail || result.secure_url,
      mediaDuration: result.duration
    });

    await message.save();
    await message.populate('sender', 'username profilePicture');
    await message.populate('receiver', 'username profilePicture');

    // Delete local file
    const fs = require('fs');
    fs.unlinkSync(req.file.path);

    res.json({ 
      success: true, 
      message: 'Video uploaded successfully',
      data: message 
    });
  } catch (error) {
    console.error('Upload video error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while uploading video' 
    });
  }
});

/**
 * @route   POST /api/chat/upload-audio
 * @desc    Upload audio/voice message to chat
 * @access  Private
 */
router.post('/upload-audio', [authMiddleware, upload.single('audio')], async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No audio file provided' 
      });
    }

    const { receiverId, duration } = req.body;

    // Verify friend relationship
    if (!req.user.friends.includes(receiverId)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not friends with this user' 
      });
    }

    // Upload to Cloudinary
    const result = await uploadAudio(req.file.path, 'chat-audio');

    // Create message
    const message = new Message({
      sender: req.user._id,
      receiver: receiverId,
      content: '🎤 Voice message',
      messageType: 'audio',
      mediaUrl: result.secure_url,
      mediaPublicId: result.public_id,
      mediaDuration: duration || result.duration
    });

    await message.save();
    await message.populate('sender', 'username profilePicture');
    await message.populate('receiver', 'username profilePicture');

    // Delete local file
    const fs = require('fs');
    fs.unlinkSync(req.file.path);

    res.json({ 
      success: true, 
      message: 'Audio uploaded successfully',
      data: message 
    });
  } catch (error) {
    console.error('Upload audio error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while uploading audio' 
    });
  }
});

/**
 * @route   DELETE /api/chat/messages/:messageId
 * @desc    Unsend/delete a message
 * @access  Private
 */
router.delete('/messages/:messageId', authMiddleware, async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ 
        success: false, 
        message: 'Message not found' 
      });
    }

    // Verify sender
    if (message.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to delete this message' 
      });
    }

    // If message has media, delete from Cloudinary
    if (message.mediaPublicId) {
      try {
        await deleteFile(message.mediaPublicId);
      } catch (error) {
        console.error('Cloudinary delete error:', error);
      }
    }

    // Mark as deleted instead of actually deleting
    message.deleted = true;
    message.deletedAt = new Date();
    message.content = 'This message was deleted';
    await message.save();

    res.json({ 
      success: true, 
      message: 'Message deleted successfully',
      data: message 
    });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while deleting message' 
    });
  }
});

/**
 * @route   GET /api/chat/media/:friendId
 * @desc    Get all media shared with a friend
 * @access  Private
 */
router.get('/media/:friendId', authMiddleware, async (req, res) => {
  try {
    const { friendId } = req.params;
    const { type } = req.query; // 'image', 'video', 'audio', or 'all'

    // Verify friend relationship
    if (!req.user.friends.includes(friendId)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not friends with this user' 
      });
    }

    // Build query
    const query = {
      $or: [
        { sender: req.user._id, receiver: friendId },
        { sender: friendId, receiver: req.user._id }
      ],
      messageType: { $in: ['image', 'video', 'audio'] },
      deleted: false
    };

    if (type && type !== 'all') {
      query.messageType = type;
    }

    // Get media messages
    const media = await Message.find(query)
      .sort({ createdAt: -1 })
      .select('sender receiver messageType mediaUrl mediaThumbnail mediaDuration createdAt')
      .populate('sender', 'username profilePicture');

    res.json({ 
      success: true, 
      media 
    });
  } catch (error) {
    console.error('Get media error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching media' 
    });
  }
});

module.exports = router;
