const Message = require('../models/Message');
const User = require('../models/User');

/**
 * Socket.io Chat Handler
 * Manages real-time chat events
 */

// Store online users: { userId: socketId }
const onlineUsers = new Map();

const initializeSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    console.log(`🔌 User connected: ${socket.id}`);

    /**
     * User joins with their userId
     */
    socket.on('join', async (userId) => {
      try {
        // Store user's socket
        onlineUsers.set(userId, socket.id);
        socket.userId = userId;
        
        // Join user's personal room
        socket.join(userId);
        
        console.log(`✅ User ${userId} joined with socket ${socket.id}`);
        
        // Notify friends that user is online
        const user = await User.findById(userId).populate('friends', '_id');
        if (user && user.friends) {
          user.friends.forEach(friend => {
            io.to(friend._id.toString()).emit('user_online', { userId });
          });
        }

        // Send current online status to user
        socket.emit('online_users', Array.from(onlineUsers.keys()));
      } catch (error) {
        console.error('Join error:', error);
      }
    });

    /**
     * Send message to another user
     */
    socket.on('send_message', async (data) => {
      try {
        const { receiverId, content } = data;
        const senderId = socket.userId;

        if (!senderId || !receiverId || !content) {
          socket.emit('error', { message: 'Invalid message data' });
          return;
        }

        // Verify friendship
        const sender = await User.findById(senderId);
        if (!sender || !sender.friends.includes(receiverId)) {
          socket.emit('error', { message: 'Not friends with this user' });
          return;
        }

        // Save message to database
        const message = new Message({
          sender: senderId,
          receiver: receiverId,
          content: content.trim()
        });

        await message.save();

        // Populate sender info
        await message.populate('sender', 'username');
        await message.populate('receiver', 'username');

        // Emit to receiver if online
        const receiverSocketId = onlineUsers.get(receiverId);
        if (receiverSocketId) {
          io.to(receiverId).emit('receive_message', {
            message: message,
            senderId: senderId
          });
        }

        // Send confirmation to sender
        socket.emit('message_sent', {
          message: message,
          tempId: data.tempId // For client-side optimistic updates
        });

        console.log(`📨 Message from ${senderId} to ${receiverId}`);
      } catch (error) {
        console.error('Send message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    /**
     * Typing indicator
     */
    socket.on('typing', (data) => {
      const { receiverId } = data;
      const senderId = socket.userId;

      if (receiverId && senderId) {
        io.to(receiverId).emit('user_typing', { userId: senderId });
      }
    });

    /**
     * Stop typing indicator
     */
    socket.on('stop_typing', (data) => {
      const { receiverId } = data;
      const senderId = socket.userId;

      if (receiverId && senderId) {
        io.to(receiverId).emit('user_stop_typing', { userId: senderId });
      }
    });

    /**
     * Mark message as read
     */
    socket.on('mark_read', async (data) => {
      try {
        const { messageId } = data;
        const userId = socket.userId;

        const message = await Message.findById(messageId);
        
        if (message && message.receiver.toString() === userId) {
          message.read = true;
          await message.save();

          // Notify sender
          const senderSocketId = onlineUsers.get(message.sender.toString());
          if (senderSocketId) {
            io.to(message.sender.toString()).emit('message_read', {
              messageId: messageId
            });
          }
        }
      } catch (error) {
        console.error('Mark read error:', error);
      }
    });

    /**
     * User disconnects
     */
    socket.on('disconnect', async () => {
      try {
        const userId = socket.userId;
        
        if (userId) {
          onlineUsers.delete(userId);
          
          // Notify friends that user is offline
          const user = await User.findById(userId).populate('friends', '_id');
          if (user && user.friends) {
            user.friends.forEach(friend => {
              io.to(friend._id.toString()).emit('user_offline', { userId });
            });
          }

          console.log(`❌ User ${userId} disconnected`);
        }
      } catch (error) {
        console.error('Disconnect error:', error);
      }
    });
  });

  return io;
};

module.exports = initializeSocketHandlers;
