const express = require('express');
const router = express.Router();
const Group = require('../models/Group');
const GroupMessage = require('../models/GroupMessage');
const User = require('../models/User');
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { cloudinary } = require('../config/cloudinary');
const { createNotification } = require('../utils/notificationHelper');

/**
 * @route   POST /api/groups
 * @desc    Create a new group
 * @access  Private
 */
router.post('/', auth, upload.single('groupPicture'), async (req, res) => {
  try {
    const { name, description, isPublic, groupActivity, maxMembers, invitedMembers } = req.body;
    const userId = req.user.id;

    // Parse invited members
    let memberIds = [];
    if (invitedMembers) {
      try {
        memberIds = JSON.parse(invitedMembers);
      } catch (e) {
        memberIds = [];
      }
    }

    // Require at least 2 members (excluding creator)
    if (memberIds.length < 2) {
      return res.status(400).json({ message: 'At least 2 members are required to create a group' });
    }

    // Upload group picture if provided
    let groupPicture = null;
    let groupPicturePublicId = null;

    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'whoru/groups',
        transformation: [{ width: 400, height: 400, crop: 'fill' }]
      });
      groupPicture = result.secure_url;
      groupPicturePublicId = result.public_id;
    }

    // Build members array - creator with creator role + invited members
    const membersArray = [
      {
        user: userId,
        role: 'creator',
        joinedAt: new Date()
      },
      ...memberIds.map(memberId => ({
        user: memberId,
        role: 'member',
        joinedAt: new Date()
      }))
    ];

    // Create group
    const group = new Group({
      name,
      description,
      groupPicture,
      groupPicturePublicId,
      creator: userId,
      members: membersArray,
      settings: {
        isPublic: isPublic === 'true' || isPublic === true,
        maxMembers: maxMembers || 50
      },
      groupActivity: groupActivity || 'chatting'
    });

    await group.save();
    await group.populate('creator', 'username profilePicture');
    await group.populate('members.user', 'username profilePicture');

    // Send notifications to invited members
    for (const memberId of memberIds) {
      await createNotification({
        recipient: memberId,
        sender: userId,
        type: 'group_invite',
        message: `You've been added to ${name}`,
        link: `/group-chat/${group._id}`,
        metadata: { groupId: group._id.toString(), groupName: name }
      }, req.app.get('io'));
      
      // Emit Socket.io event
      const io = req.app.get('io');
      io.to(memberId.toString()).emit('group_invite', {
        groupId: group._id,
        groupName: name,
        invitedBy: userId
      });
    }

    res.status(201).json(group);
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/groups
 * @desc    Get user's groups
 * @access  Private
 */
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const groups = await Group.find({
      'members.user': userId
    })
      .populate('creator', 'username profilePicture')
      .populate('members.user', 'username profilePicture')
      .sort({ lastActivity: -1 });

    res.json(groups);
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/groups/discover
 * @desc    Discover PUBLIC groups only (exclude private groups)
 * @access  Private
 */
router.get('/discover', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { activity, search } = req.query;

    // PHASE 2 REQUIREMENT: Only PUBLIC groups, exclude groups user is already member of
    let query = {
      'settings.isPublic': true, // MUST be public
      'members.user': { $ne: userId } // User is NOT a member
    };

    if (activity) {
      query.groupActivity = activity;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const groups = await Group.find(query)
      .populate('creator', 'username profilePicture')
      .populate('members.user', 'username profilePicture')
      .sort({ memberCount: -1, lastActivity: -1 })
      .limit(20);

    console.log(`✅ Discover: Found ${groups.length} public groups for user ${userId}`);
    res.json(groups);
  } catch (error) {
    console.error('❌ Discover groups error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/groups/:groupId
 * @desc    Get group details
 * @access  Private
 */
router.get('/:groupId', auth, async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = await Group.findById(groupId)
      .populate('creator', 'username profilePicture')
      .populate('members.user', 'username profilePicture')
      .populate('liveSession.participants', 'username profilePicture')
      .populate('voiceChannel.participants.user', 'username profilePicture');

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    res.json(group);
  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/groups/:groupId/join
 * @desc    Join a group or send join request for private groups
 * @access  Private
 */
router.post('/:groupId/join', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { message } = req.body;
    const userId = req.user.id;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Check if already a member
    if (group.isMember(userId)) {
      return res.status(400).json({ message: 'Already a member' });
    }

    // Check if banned
    if (group.bannedMembers && group.bannedMembers.some(banned => banned.user.toString() === userId)) {
      return res.status(403).json({ message: 'You are banned from this group' });
    }

    // Check if already requested
    const existingRequest = group.joinRequests?.find(r => r.user.toString() === userId);
    if (existingRequest) {
      return res.status(400).json({ message: 'Join request already sent' });
    }

    // Check if group is full
    if (group.members.length >= group.settings.maxMembers) {
      return res.status(400).json({ message: 'Group is full' });
    }

    // For private groups or groups requiring approval, send join request
    // PHASE 2: Private groups can ONLY be joined via invitation
    if (group.privacy === 'private' || group.settings.requireApproval) {
      // Check if user has a pending invitation
      const hasInvitation = group.invitations && group.invitations.some(
        inv => inv.user.toString() === userId
      );
      
      // If no invitation exists for private group, reject
      if (group.privacy === 'private' && !hasInvitation) {
        return res.status(403).json({ 
          message: 'This is a private group. You can only join via invitation.' 
        });
      }
      
      group.joinRequests = group.joinRequests || [];
      group.joinRequests.push({
        user: userId,
        requestedAt: new Date(),
        message: message || ''
      });
      await group.save();

      // Notify group creator and admins
      const admins = group.members.filter(m => m.role === 'creator' || m.role === 'admin');
      const joiningUser = await User.findById(userId);

      for (const admin of admins) {
        await createNotification({
          recipient: admin.user,
          sender: userId,
          type: 'group_join_request',
          message: `${joiningUser.username} wants to join ${group.name}`,
          link: `/group-chat/${groupId}`,
          metadata: { groupId: groupId.toString(), userId: userId }
        }, req.app.get('io'));
      }

      return res.json({ message: 'Join request sent', requiresApproval: true });
    }

    // For public groups, add immediately
    group.members.push({
      user: userId,
      role: 'member',
      joinedAt: new Date()
    });

    await group.save();
    await group.populate('members.user', 'username profilePicture');

    // Notify group admins
    const admins = group.members.filter(m => m.role === 'admin' || group.creator.toString() === m.user._id.toString());
    const joiningUser = await User.findById(userId);

    for (const admin of admins) {
      await createNotification({
        recipient: admin.user,
        sender: userId,
        type: 'group_join',
        message: `${joiningUser.username} joined ${group.name}`,
        link: `/group-chat/${groupId}`,
        metadata: { groupId: groupId.toString(), userId: userId }
      }, req.app.get('io'));
    }

    res.json(group);
  } catch (error) {
    console.error('Join group error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/groups/:groupId/leave
 * @desc    Leave a group
 * @access  Private
 */
router.post('/:groupId/leave', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Cannot leave if creator
    if (group.creator.toString() === userId) {
      return res.status(400).json({ message: 'Creator cannot leave group' });
    }

    // Remove from members
    group.members = group.members.filter(m => m.user.toString() !== userId);
    await group.save();

    res.json({ message: 'Left group successfully' });
  } catch (error) {
    console.error('Leave group error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/groups/:groupId/join-requests
 * @desc    Get all join requests for a group (admin only)
 * @access  Private
 */
router.get('/:groupId/join-requests', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

    const group = await Group.findById(groupId).populate('joinRequests.user', 'username profilePicture');

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Check if user is admin/creator
    const member = group.members.find(m => m.user.toString() === userId);
    if (!member || !['creator', 'admin'].includes(member.role)) {
      return res.status(403).json({ message: 'Only admins can view join requests' });
    }

    res.json({ joinRequests: group.joinRequests || [] });
  } catch (error) {
    console.error('Get join requests error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/groups/:groupId/join-requests/:userId/accept
 * @desc    Accept a join request (admin only)
 * @access  Private
 */
router.post('/:groupId/join-requests/:userId/accept', auth, async (req, res) => {
  try {
    const { groupId, userId: requestUserId } = req.params;
    const adminId = req.user.id;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Check if requester is admin/creator
    const admin = group.members.find(m => m.user.toString() === adminId);
    if (!admin || !['creator', 'admin'].includes(admin.role)) {
      return res.status(403).json({ message: 'Only admins can accept join requests' });
    }

    // Check if request exists
    const requestIndex = group.joinRequests?.findIndex(r => r.user.toString() === requestUserId);
    if (requestIndex === -1 || requestIndex === undefined) {
      return res.status(404).json({ message: 'Join request not found' });
    }

    // Add member
    group.members.push({
      user: requestUserId,
      role: 'member',
      joinedAt: new Date()
    });

    // Remove from join requests
    group.joinRequests.splice(requestIndex, 1);
    await group.save();
    await group.populate('members.user', 'username profilePicture');

    // Notify the user
    const requestingUser = await User.findById(requestUserId);
    await createNotification({
      recipient: requestUserId,
      sender: adminId,
      type: 'group_request_accepted',
      message: `Your request to join ${group.name} was accepted!`,
      link: `/group-chat/${groupId}`
    }, req.app.get('io'));

    res.json({ message: 'Join request accepted', group });
  } catch (error) {
    console.error('Accept join request error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/groups/:groupId/join-requests/:userId/reject
 * @desc    Reject a join request (admin only)
 * @access  Private
 */
router.post('/:groupId/join-requests/:userId/reject', auth, async (req, res) => {
  try {
    const { groupId, userId: requestUserId } = req.params;
    const adminId = req.user.id;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Check if requester is admin/creator
    const admin = group.members.find(m => m.user.toString() === adminId);
    if (!admin || !['creator', 'admin'].includes(admin.role)) {
      return res.status(403).json({ message: 'Only admins can reject join requests' });
    }

    // Check if request exists
    const requestIndex = group.joinRequests?.findIndex(r => r.user.toString() === requestUserId);
    if (requestIndex === -1 || requestIndex === undefined) {
      return res.status(404).json({ message: 'Join request not found' });
    }

    // Remove from join requests
    group.joinRequests.splice(requestIndex, 1);
    await group.save();

    // Optionally notify the user (can be disabled to avoid negative feedback)
    // await createNotification({
    //   recipient: requestUserId,
    //   type: 'group_request_rejected',
    //   message: `Your request to join ${group.name} was declined`,
    // }, req.app.get('io'));

    res.json({ message: 'Join request rejected' });
  } catch (error) {
    console.error('Reject join request error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/groups/:groupId/live-session/start
 * @desc    Start a live study/game session (UNIQUE FEATURE)
 * @access  Private
 */
router.post('/:groupId/live-session/start', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;
    const { sessionType, duration } = req.body; // duration in minutes

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!group.isMember(userId)) {
      return res.status(403).json({ message: 'Not a member' });
    }

    if (group.liveSession.isActive) {
      return res.status(400).json({ message: 'Session already active' });
    }

    // Start session
    group.liveSession = {
      isActive: true,
      startedAt: new Date(),
      participants: [userId],
      sessionType,
      timer: {
        duration,
        startedAt: new Date()
      }
    };

    await group.save();
    await group.populate('liveSession.participants', 'username profilePicture');

    // Notify all group members
    const io = req.app.get('io');
    io.to(`group_${groupId}`).emit('live_session_started', {
      groupId,
      session: group.liveSession
    });

    res.json(group.liveSession);
  } catch (error) {
    console.error('Start live session error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/groups/:groupId/live-session/join
 * @desc    Join active live session
 * @access  Private
 */
router.post('/:groupId/live-session/join', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

    const group = await Group.findById(groupId);

    if (!group || !group.liveSession.isActive) {
      return res.status(400).json({ message: 'No active session' });
    }

    if (!group.isMember(userId)) {
      return res.status(403).json({ message: 'Not a member' });
    }

    // Add to participants
    if (!group.liveSession.participants.includes(userId)) {
      group.liveSession.participants.push(userId);
      await group.save();
      await group.populate('liveSession.participants', 'username profilePicture');
    }

    // Notify other participants
    const io = req.app.get('io');
    const joiningUser = await User.findById(userId);
    io.to(`group_${groupId}`).emit('user_joined_session', {
      groupId,
      user: {
        _id: joiningUser._id,
        username: joiningUser.username,
        profilePicture: joiningUser.profilePicture
      }
    });

    res.json(group.liveSession);
  } catch (error) {
    console.error('Join live session error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/groups/:groupId/live-session/end
 * @desc    End live session
 * @access  Private
 */
router.post('/:groupId/live-session/end', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Only admin or session starter can end
    if (!group.isAdmin(userId)) {
      return res.status(403).json({ message: 'Only admins can end session' });
    }

    group.liveSession = {
      isActive: false,
      participants: [],
      sessionType: null
    };

    await group.save();

    // Notify all participants
    const io = req.app.get('io');
    io.to(`group_${groupId}`).emit('live_session_ended', { groupId });

    res.json({ message: 'Session ended' });
  } catch (error) {
    console.error('End live session error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   PATCH /api/groups/:groupId/vibe
 * @desc    Update group vibe/mood (UNIQUE FEATURE)
 * @access  Private
 */
router.patch('/:groupId/vibe', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { vibe } = req.body;
    const userId = req.user.id;

    const group = await Group.findById(groupId);

    if (!group || !group.isMember(userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    group.currentVibe = vibe;
    await group.save();

    // Broadcast vibe change
    const io = req.app.get('io');
    io.to(`group_${groupId}`).emit('group_vibe_changed', { groupId, vibe });

    res.json({ vibe: group.currentVibe });
  } catch (error) {
    console.error('Update group vibe error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   PATCH /api/groups/:groupId
 * @desc    Update group info (creator/admin only)
 * @access  Private
 */
router.patch('/:groupId', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;
    const { name, description, privacy } = req.body;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Check if user is creator or admin
    const member = group.members.find(m => m.user.toString() === userId);
    if (!member || !['creator', 'admin'].includes(member.role)) {
      return res.status(403).json({ message: 'Only creator or admin can update group' });
    }

    if (name) group.name = name;
    if (description) group.description = description;
    if (privacy) group.privacy = privacy;

    await group.save();
    await group.populate('members.user', 'username profilePicture');

    res.json(group);
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   PATCH /api/groups/:groupId/members/:memberId/role
 * @desc    Update member role (creator only)
 * @access  Private
 */
router.patch('/:groupId/members/:memberId/role', auth, async (req, res) => {
  try {
    const { groupId, memberId } = req.params;
    const userId = req.user.id;
    const { role } = req.body;

    if (!['member', 'moderator', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Only creator can change roles
    const requester = group.members.find(m => m.user.toString() === userId);
    if (!requester || requester.role !== 'creator') {
      return res.status(403).json({ message: 'Only creator can change member roles' });
    }

    // Find the member to update
    const targetMember = group.members.find(m => m.user.toString() === memberId);
    if (!targetMember) {
      return res.status(404).json({ message: 'Member not found in group' });
    }

    if (targetMember.role === 'creator') {
      return res.status(400).json({ message: 'Cannot change creator role' });
    }

    targetMember.role = role;
    await group.save();
    await group.populate('members.user', 'username profilePicture');

    res.json(group);
  } catch (error) {
    console.error('Update member role error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   DELETE /api/groups/:groupId/members/:memberId
 * @desc    Remove member from group (admin only)
 * @access  Private
 */
router.delete('/:groupId/members/:memberId', auth, async (req, res) => {
  try {
    const { groupId, memberId } = req.params;
    const userId = req.user.id;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Check if requester has permission
    const requester = group.members.find(m => m.user.toString() === userId);
    if (!requester || !['creator', 'admin', 'moderator'].includes(requester.role)) {
      return res.status(403).json({ message: 'Only admin/moderator can remove members' });
    }

    // Find target member
    const targetMember = group.members.find(m => m.user.toString() === memberId);
    if (!targetMember) {
      return res.status(404).json({ message: 'Member not found' });
    }

    if (targetMember.role === 'creator') {
      return res.status(400).json({ message: 'Cannot remove creator from group' });
    }

    // Remove the member
    group.members = group.members.filter(m => m.user.toString() !== memberId);
    await group.save();
    await group.populate('members.user', 'username profilePicture');

    // Notify removed member
    const io = req.app.get('io');
    await createNotification({
      recipient: memberId,
      sender: userId,
      type: 'group_removed',
      message: `You were removed from ${group.name}`,
      link: `/groups`
    }, io);

    res.json(group);
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   DELETE /api/groups/:groupId
 * @desc    Delete group (creator only)
 * @access  Private
 */
router.delete('/:groupId', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (group.creator.toString() !== userId) {
      return res.status(403).json({ message: 'Only creator can delete group' });
    }

    // Delete group picture from Cloudinary
    if (group.groupPicturePublicId) {
      await cloudinary.uploader.destroy(group.groupPicturePublicId);
    }

    // Delete all group messages
    await GroupMessage.deleteMany({ group: groupId });

    await group.deleteOne();

    res.json({ message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/groups/:groupId/kick
 * @desc    Kick a member from group (ADMIN POWER)
 * @access  Private (Admin only)
 */
router.post('/:groupId/kick', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { memberId } = req.body;
    const userId = req.user.id;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Check if user is admin
    if (!group.isAdmin(userId)) {
      return res.status(403).json({ message: 'Only admins can kick members' });
    }

    // Cannot kick creator
    if (memberId === group.creator.toString()) {
      return res.status(403).json({ message: 'Cannot kick group creator' });
    }

    // Remove member
    group.members = group.members.filter(m => m.user.toString() !== memberId);
    await group.save();

    // Notify kicked member
    await createNotification(
      memberId,
      userId,
      'group_kicked',
      `You were removed from ${group.name}`,
      { groupId: group._id }
    );

    const io = req.app.get('io');
    io.to(memberId).emit('group_kicked', { groupId: group._id, groupName: group.name });

    res.json({ message: 'Member kicked successfully' });
  } catch (error) {
    console.error('Kick member error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/groups/:groupId/promote
 * @desc    Promote member to moderator (ADMIN POWER)
 * @access  Private (Admin only)
 */
router.post('/:groupId/promote', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { memberId, role } = req.body; // role: 'moderator' or 'admin'
    const userId = req.user.id;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Only creator can promote to admin, admins can promote to moderator
    if (role === 'admin' && group.creator.toString() !== userId) {
      return res.status(403).json({ message: 'Only creator can promote to admin' });
    }

    if (!group.isAdmin(userId)) {
      return res.status(403).json({ message: 'Only admins can promote members' });
    }

    // Update member role
    const member = group.members.find(m => m.user.toString() === memberId);
    if (!member) {
      return res.status(404).json({ message: 'Member not found' });
    }

    member.role = role;
    await group.save();

    // Notify promoted member
    await createNotification(
      memberId,
      userId,
      'group_promoted',
      `You've been promoted to ${role} in ${group.name}!`,
      { groupId: group._id }
    );

    res.json({ message: `Member promoted to ${role}` });
  } catch (error) {
    console.error('Promote member error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/groups/:groupId/demote
 * @desc    Demote moderator/admin to member (ADMIN POWER)
 * @access  Private (Admin only)
 */
router.post('/:groupId/demote', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { memberId } = req.body;
    const userId = req.user.id;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Only creator can demote admins
    const targetMember = group.members.find(m => m.user.toString() === memberId);
    if (!targetMember) {
      return res.status(404).json({ message: 'Member not found' });
    }

    if (targetMember.role === 'admin' && group.creator.toString() !== userId) {
      return res.status(403).json({ message: 'Only creator can demote admins' });
    }

    // Cannot demote creator
    if (memberId === group.creator.toString()) {
      return res.status(403).json({ message: 'Cannot demote group creator' });
    }

    if (!group.isAdmin(userId)) {
      return res.status(403).json({ message: 'Only admins can demote members' });
    }

    targetMember.role = 'member';
    await group.save();

    // Notify demoted member
    await createNotification(
      memberId,
      userId,
      'group_demoted',
      `Your role was changed to member in ${group.name}`,
      { groupId: group._id }
    );

    res.json({ message: 'Member demoted successfully' });
  } catch (error) {
    console.error('Demote member error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/groups/:groupId/invite
 * @desc    Invite a user to join group
 * @access  Private
 */
router.post('/:groupId/invite', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId, message } = req.body;
    const inviterId = req.user.id;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Check if inviter is a member
    if (!group.isMember(inviterId)) {
      return res.status(403).json({ message: 'You must be a member to invite others' });
    }

    // Check if member invites are allowed or if user is admin
    if (!group.settings.allowMemberInvites && !group.isAdmin(inviterId)) {
      return res.status(403).json({ message: 'Only admins can invite members' });
    }

    // Check if user is already a member
    if (group.isMember(userId)) {
      return res.status(400).json({ message: 'User is already a member' });
    }

    // Check if user is already invited
    if (group.invitations.some(inv => inv.user.toString() === userId)) {
      return res.status(400).json({ message: 'User is already invited' });
    }

    // Check if user is banned
    if (group.bannedMembers.some(banned => banned.user.toString() === userId)) {
      return res.status(403).json({ message: 'User is banned from this group' });
    }

    // Check max members
    if (group.members.length >= group.settings.maxMembers) {
      return res.status(400).json({ message: 'Group is full' });
    }

    // Add invitation
    group.invitations.push({
      user: userId,
      invitedBy: inviterId,
      message: message || ''
    });

    await group.save();

    // Create notification with proper structure
    await createNotification({
      recipient: userId,
      sender: inviterId,
      type: 'group_invitation',
      message: `You've been invited to join ${group.name}`,
      link: `/group-chat/${group._id}`,
      metadata: { groupId: group._id.toString(), groupName: group.name }
    }, req.app.get('io'));

    res.json({ message: 'Invitation sent successfully', group });
  } catch (error) {
    console.error('❌ Invite user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/groups/:groupId/invitation/accept
 * @desc    Accept a group invitation
 * @access  Private
 */
router.post('/:groupId/invitation/accept', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

    const group = await Group.findById(groupId).populate('members.user', 'username profilePicture');
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Find invitation
    const invitationIndex = group.invitations.findIndex(inv => inv.user.toString() === userId);
    if (invitationIndex === -1) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    // Check if already a member
    if (group.isMember(userId)) {
      return res.status(400).json({ message: 'You are already a member' });
    }

    // Check max members
    if (group.members.length >= group.settings.maxMembers) {
      return res.status(400).json({ message: 'Group is full' });
    }

    // Add user as member
    group.members.push({
      user: userId,
      role: 'member'
    });

    // Remove invitation
    group.invitations.splice(invitationIndex, 1);

    await group.save();

    // Notify the inviter
    const invitation = group.invitations[invitationIndex];
    if (invitation && invitation.invitedBy) {
      await createNotification(
        invitation.invitedBy,
        userId,
        'group_joined',
        `${req.user.username} accepted your invitation to ${group.name}`,
        { groupId: group._id }
      );
    }

    res.json({ message: 'Joined group successfully', group });
  } catch (error) {
    console.error('Accept invitation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/groups/:groupId/invitation/decline
 * @desc    Decline a group invitation
 * @access  Private
 */
router.post('/:groupId/invitation/decline', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Find and remove invitation
    const invitationIndex = group.invitations.findIndex(inv => inv.user.toString() === userId);
    if (invitationIndex === -1) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    group.invitations.splice(invitationIndex, 1);
    await group.save();

    res.json({ message: 'Invitation declined' });
  } catch (error) {
    console.error('Decline invitation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/groups/my-invitations
 * @desc    Get all group invitations for current user
 * @access  Private
 */
router.get('/my-invitations', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const groups = await Group.find({ 'invitations.user': userId })
      .populate('creator', 'username profilePicture')
      .populate('invitations.invitedBy', 'username profilePicture')
      .select('name description groupPicture privacy invitations members');

    // Filter to only return the user's invitation
    const invitations = groups.map(group => ({
      group: {
        _id: group._id,
        name: group.name,
        description: group.description,
        groupPicture: group.groupPicture,
        privacy: group.privacy,
        memberCount: group.members.length
      },
      invitation: group.invitations.find(inv => inv.user.toString() === userId)
    }));

    res.json({ invitations });
  } catch (error) {
    console.error('Get invitations error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/groups/:groupId/ban
 * @desc    Ban a member from the group
 * @access  Private (Admin/Moderator with proper permissions)
 */
router.post('/:groupId/ban', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId, reason } = req.body;
    const adminId = req.user.id;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // PHASE 3: Use permission method to check if admin can ban this user
    if (!group.canBanUser(adminId, userId)) {
      const adminRole = group.getUserRole(adminId);
      const targetRole = group.getUserRole(userId);
      return res.status(403).json({ 
        message: `${adminRole}s cannot ban ${targetRole}s. Only creator can ban admins, admins can ban moderators/members, moderators can ban members.` 
      });
    }

    // Check if already banned
    if (group.bannedMembers.some(banned => banned.user.toString() === userId)) {
      return res.status(400).json({ message: 'User is already banned' });
    }

    // Remove from members if present
    group.members = group.members.filter(m => m.user.toString() !== userId);

    // Add to banned list
    group.bannedMembers.push({
      user: userId,
      bannedBy: adminId,
      reason: reason || 'No reason provided'
    });

    await group.save();

    // Notify banned user with proper structure
    await createNotification({
      recipient: userId,
      sender: adminId,
      type: 'group_banned',
      message: `You have been banned from ${group.name}`,
      link: null,
      metadata: { groupId: group._id.toString(), reason: reason || 'No reason provided' }
    }, req.app.get('io'));

    console.log(`✅ User ${userId} banned from group ${groupId} by ${adminId}`);
    res.json({ message: 'User banned successfully', group });
  } catch (error) {
    console.error('❌ Ban user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/groups/:groupId/unban
 * @desc    Unban a member from the group
 * @access  Private (Admin only)
 */
router.post('/:groupId/unban', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId } = req.body;
    const adminId = req.user.id;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Only admins can unban
    if (!group.isAdmin(adminId)) {
      return res.status(403).json({ message: 'Only admins can unban members' });
    }

    // Remove from banned list
    const bannedIndex = group.bannedMembers.findIndex(banned => banned.user.toString() === userId);
    if (bannedIndex === -1) {
      return res.status(404).json({ message: 'User is not banned' });
    }

    group.bannedMembers.splice(bannedIndex, 1);
    await group.save();

    // Notify unbanned user
    await createNotification(
      userId,
      adminId,
      'group_unbanned',
      `You have been unbanned from ${group.name}`,
      { groupId: group._id }
    );

    res.json({ message: 'User unbanned successfully', group });
  } catch (error) {
    console.error('Unban user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/groups/:groupId/mute
 * @desc    Mute a member in the group
 * @access  Private (Moderator/Admin with proper permissions)
 */
router.post('/:groupId/mute', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId, duration, reason } = req.body; // duration in minutes
    const modId = req.user.id;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // PHASE 3: Use permission method - moderators and above can mute members
    if (!group.isModerator(modId)) {
      return res.status(403).json({ message: 'Only moderators and above can mute members' });
    }

    // Use canBanUser method for mute permission check (same hierarchy)
    if (!group.canBanUser(modId, userId)) {
      const modRole = group.getUserRole(modId);
      const targetRole = group.getUserRole(userId);
      return res.status(403).json({ 
        message: `${modRole}s cannot mute ${targetRole}s. Check permission hierarchy.` 
      });
    }

    // Check if already muted
    const existingMute = group.mutedMembers.find(muted => muted.user.toString() === userId);
    if (existingMute) {
      // Update existing mute
      existingMute.mutedBy = modId;
      existingMute.mutedAt = new Date();
      existingMute.mutedUntil = duration ? new Date(Date.now() + duration * 60 * 1000) : null;
      existingMute.reason = reason || 'No reason provided';
    } else {
      // Add new mute
      group.mutedMembers.push({
        user: userId,
        mutedBy: modId,
        mutedUntil: duration ? new Date(Date.now() + duration * 60 * 1000) : null,
        reason: reason || 'No reason provided'
      });
    }

    await group.save();

    // Notify muted user with proper structure
    await createNotification({
      recipient: userId,
      sender: modId,
      type: 'group_muted',
      message: `You have been muted in ${group.name}${duration ? ` for ${duration} minutes` : ''}`,
      link: null,
      metadata: { 
        groupId: group._id.toString(), 
        duration: duration || null,
        reason: reason || 'No reason provided'
      }
    }, req.app.get('io'));

    console.log(`✅ User ${userId} muted in group ${groupId} by ${modId}`);
    res.json({ message: 'User muted successfully', group });
  } catch (error) {
    console.error('❌ Mute user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/groups/:groupId/unmute
 * @desc    Unmute a member in the group
 * @access  Private (Moderator/Admin only)
 */
router.post('/:groupId/unmute', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId } = req.body;
    const modId = req.user.id;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Check if user has permission
    const modMember = group.members.find(m => m.user.toString() === modId);
    if (!modMember || !['creator', 'admin', 'moderator'].includes(modMember.role)) {
      return res.status(403).json({ message: 'Only moderators can unmute members' });
    }

    // Remove from muted list
    const mutedIndex = group.mutedMembers.findIndex(muted => muted.user.toString() === userId);
    if (mutedIndex === -1) {
      return res.status(404).json({ message: 'User is not muted' });
    }

    group.mutedMembers.splice(mutedIndex, 1);
    await group.save();

    // Notify unmuted user
    await createNotification(
      userId,
      modId,
      'group_unmuted',
      `You have been unmuted in ${group.name}`,
      { groupId: group._id }
    );

    res.json({ message: 'User unmuted successfully', group });
  } catch (error) {
    console.error('Unmute user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/groups/:groupId/rules
 * @desc    Add a rule to the group
 * @access  Private (Admin only)
 */
router.post('/:groupId/rules', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { text } = req.body;
    const adminId = req.user.id;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Only admins can add rules
    if (!group.isAdmin(adminId)) {
      return res.status(403).json({ message: 'Only admins can add rules' });
    }

    group.rules.push({
      text,
      createdBy: adminId
    });

    await group.save();

    res.json({ message: 'Rule added successfully', group });
  } catch (error) {
    console.error('Add rule error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   DELETE /api/groups/:groupId/rules/:ruleId
 * @desc    Delete a rule from the group
 * @access  Private (Admin only)
 */
router.delete('/:groupId/rules/:ruleId', auth, async (req, res) => {
  try {
    const { groupId, ruleId } = req.params;
    const adminId = req.user.id;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Only admins can delete rules
    if (!group.isAdmin(adminId)) {
      return res.status(403).json({ message: 'Only admins can delete rules' });
    }

    group.rules = group.rules.filter(rule => rule._id.toString() !== ruleId);
    await group.save();

    res.json({ message: 'Rule deleted successfully', group });
  } catch (error) {
    console.error('Delete rule error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/groups/:groupId/announcements
 * @desc    Create an announcement
 * @access  Private (Admin only)
 */
router.post('/:groupId/announcements', auth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { text, isPinned } = req.body;
    const adminId = req.user.id;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Only admins can create announcements
    if (!group.isAdmin(adminId)) {
      return res.status(403).json({ message: 'Only admins can create announcements' });
    }

    group.announcements.push({
      text,
      createdBy: adminId,
      isPinned: isPinned !== undefined ? isPinned : true
    });

    await group.save();

    res.json({ message: 'Announcement created successfully', group });
  } catch (error) {
    console.error('Create announcement error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   DELETE /api/groups/:groupId/announcements/:announcementId
 * @desc    Delete an announcement
 * @access  Private (Admin only)
 */
router.delete('/:groupId/announcements/:announcementId', auth, async (req, res) => {
  try {
    const { groupId, announcementId } = req.params;
    const adminId = req.user.id;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Only admins can delete announcements
    if (!group.isAdmin(adminId)) {
      return res.status(403).json({ message: 'Only admins can delete announcements' });
    }

    group.announcements = group.announcements.filter(announcement => announcement._id.toString() !== announcementId);
    await group.save();

    res.json({ message: 'Announcement deleted successfully', group });
  } catch (error) {
    console.error('Delete announcement error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
