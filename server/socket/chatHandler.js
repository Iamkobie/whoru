const Message = require('../models/Message');
const GroupMessage = require('../models/GroupMessage');
const Group = require('../models/Group');
const User = require('../models/User');
const { createNotification } = require('../utils/notificationHelper');

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
        await message.populate('sender', 'username profilePicture');
        await message.populate('receiver', 'username profilePicture');

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
        
        // Create notification for new message
        await createNotification({
          recipient: receiverId,
          sender: senderId,
          type: 'new_message',
          message: `${message.sender.username} sent you a message`,
          link: `/chat/${senderId}`,
          metadata: { messageId: message._id.toString() }
        }, io);

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

    // ===== GROUP CHAT HANDLERS =====

    /**
     * Join a group room
     */
    socket.on('join_group', async (data) => {
      try {
        const { groupId } = data;
        const userId = socket.userId;

        if (!userId || !groupId) {
          return;
        }

        // Verify user is member of group
        const group = await Group.findById(groupId);
        const isMember = group.members.some(m => m.user.toString() === userId);

        if (isMember) {
          socket.join(`group:${groupId}`);
          console.log(`✅ User ${userId} joined group ${groupId}`);
          
          // Notify group
          socket.to(`group:${groupId}`).emit('user_joined_group', {
            userId,
            groupId
          });
        }
      } catch (error) {
        console.error('Join group error:', error);
      }
    });

    /**
     * Leave a group room
     */
    socket.on('leave_group', (data) => {
      const { groupId } = data;
      const userId = socket.userId;

      if (groupId) {
        socket.leave(`group:${groupId}`);
        console.log(`User ${userId} left group ${groupId}`);
        
        socket.to(`group:${groupId}`).emit('user_left_group', {
          userId,
          groupId
        });
      }
    });

    /**
     * Send group message
     */
    socket.on('send_group_message', async (data) => {
      try {
        const { groupId, content, messageType = 'text', tempId } = data;
        const senderId = socket.userId;

        if (!senderId || !groupId || !content) {
          socket.emit('error', { message: 'Invalid message data' });
          return;
        }

        // Verify user is member
        const group = await Group.findById(groupId).populate('members.user', 'username profilePicture');
        if (!group) {
          socket.emit('error', { message: 'Group not found' });
          return;
        }

        const memberData = group.members.find(m => m.user._id.toString() === senderId);
        if (!memberData) {
          socket.emit('error', { message: 'Not a member of this group' });
          return;
        }

        // PHASE 3: Check if user is muted
        const mutedMember = group.mutedMembers.find(m => m.user.toString() === senderId);
        if (mutedMember) {
          // Check if mute has expired
          if (mutedMember.mutedUntil && new Date() > mutedMember.mutedUntil) {
            // Remove expired mute
            group.mutedMembers = group.mutedMembers.filter(m => m.user.toString() !== senderId);
            await group.save();
          } else {
            // User is still muted
            const timeRemaining = mutedMember.mutedUntil 
              ? Math.ceil((mutedMember.mutedUntil - new Date()) / 60000) 
              : 'indefinitely';
            socket.emit('error', { 
              message: `You are muted in this group${timeRemaining !== 'indefinitely' ? ` for ${timeRemaining} more minutes` : ''}` 
            });
            return;
          }
        }

        // Save message - handle both string and object content
        const messageContent = typeof content === 'string' 
          ? { text: content.trim(), type: messageType }
          : content;

        const message = new GroupMessage({
          group: groupId,
          sender: senderId,
          messageType,
          content: messageContent
        });

        await message.save();
        await message.populate('sender', '_id username profilePicture');

        // Add sender role to the populated message
        const messageWithRole = {
          ...message.toObject(),
          sender: {
            ...message.sender.toObject(),
            role: memberData.role
          }
        };

        // Update group last activity
        group.lastActivity = new Date();
        await group.save();

        // Emit to all group members (including sender for multi-device sync)
        io.to(`group:${groupId}`).emit('receive_group_message', {
          message: messageWithRole,
          groupId,
          tempId
        });

        // Send ACK confirmation to sender with tempId for matching
        socket.emit('group_message_sent', {
          message: messageWithRole,
          tempId,
          success: true
        });

        console.log(`📨 Group message in ${groupId} from ${senderId}`);
      } catch (error) {
        console.error('Send group message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    /**
     * Group typing indicator
     */
    socket.on('group_typing', (data) => {
      const { groupId } = data;
      const userId = socket.userId;

      if (groupId && userId) {
        socket.to(`group:${groupId}`).emit('user_typing_group', { 
          userId, 
          groupId 
        });
      }
    });

    /**
     * Stop group typing
     */
    socket.on('group_stop_typing', (data) => {
      const { groupId } = data;
      const userId = socket.userId;

      if (groupId && userId) {
        socket.to(`group:${groupId}`).emit('user_stop_typing_group', { 
          userId, 
          groupId 
        });
      }
    });
  });

  return io;
};

module.exports = initializeSocketHandlers;
