const express = require('express');
const router = express.Router();
const Group = require('../models/Group');
const Message = require('../models/Message');
const User = require('../models/user');

const { getGroupChatHistory } = require('../controllers/chatController');

// 🔹 Fetch All Groups for a User
router.get('/groups', async (req, res) => {
  try {
    const { username } = req.query;
    const groups = await Group.find({ members: username }).lean();  // Use lean() for faster read
    res.json(groups);
  } catch (error) {
    console.error('Error fetching groups:', error);  // Improved error logging
    res.status(500).json({ error: 'Error fetching groups' });
  }
});

// Add user to group
router.post("/groups/add-user", async (req, res) => {
  try {
    console.log("🔹 Request body:", req.body);

    const { groupName, username } = req.body;
    if (!groupName || !username) {
      console.error(" Missing groupName or username");
      return res.status(400).json({ error: "Missing groupName or username" });
    }

    const user = await User.findOne({ username }).lean();  // Use lean() for faster read
    if (!user) {
      console.error(" User not found:", username);
      return res.status(404).json({ error: "No such user found" });
    }

    const group = await Group.findOne({ name: groupName });
    if (!group) {
      console.error(" Group not found:", groupName);
      return res.status(404).json({ error: "Group not found" });
    }

    if (!group.members.includes(username)) {
      console.log(` Adding ${username} to group: ${groupName}`);
      group.members.push(username);
      await group.save();
    } else {
      console.log(` User ${username} is already in the group`);
    }

    res.json({ success: true, message: `User ${username} added to group ${groupName}` });
  } catch (error) {
    console.error(" Error adding user to group:", error);
    res.status(500).json({ error: "Error adding user to group" });
  }
});

// 🔹 Fetch Group Chat Messages
router.get('/groups/groupMessage', async (req, res) => {
  try {
    const { group, sender, message } = req.body;
    
    const groupData = await Group.find({ name: group }).lean();  // Use lean() for faster read

    if (!groupData || !groupData.members.includes(username)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const newMessage = { sender, message, timestamp: new Date() };
    groupData.messages.push(newMessage);  
    await groupData.save();
    res.json({ success: true, message: 'Message sent!' });

  } catch (error) {
    console.error('Error fetching group messages:', error);  // Improved error logging
    res.status(500).json({ error: 'Error fetching group messages' });
  }
});

// Send message & store in DB
router.post('/send', async (req, res) => {
  try {
    const { sender, receiver, message, group } = req.body;
    const newMessage = new Message({ sender, receiver, message, group });
    await newMessage.save();
    res.status(201).json({ success: true, message: 'Message sent!' });
  } catch (error) {
    console.error('Error sending message:', error);  // Improved error logging
    res.status(500).json({ error: 'Error sending message' });
  }
});

// Get messages between two users
router.get('/messages/:user1/:user2', async (req, res) => {
  try {
    const { user1, user2 } = req.params;
    const messages = await Message.find({
      $or: [
        { sender: user1, receiver: user2 },
        { sender: user2, receiver: user1 }
      ]
    }).sort({ timestamp: 1 })
    .select("sender receiver message timestamp isRead")
    .lean();  // Use lean() for faster read

    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);  // Improved error logging
    res.status(500).json({ error: 'Error fetching messages' });
  }
});

// Get unread message count for a user
router.get('/messages/unread/:user', async (req, res) => {
  try {
    const { user } = req.params;
    const unreadCount = await Message.countDocuments({ receiver: user, isRead: false });
    res.json({ unreadCount });
  } catch (error) {
    console.error('Error fetching unread messages:', error);  // Improved error logging
    res.status(500).json({ error: 'Error fetching unread messages' });
  }
});

// Get unread message count for a group
router.get('/groups/unread/:groupName/:username', async (req, res) => {
  try {
    const { groupName, username } = req.params;
    const group = await Group.findOne({ name: groupName });
    
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Count unread messages from both Message collection and group's messages array
    const unreadMessagesCount = group.messages.filter(msg => 
      !msg.isRead && msg.sender !== username && msg.timestamp > new Date(Date.now() - 24 * 60 * 60 * 1000) // Only count messages from last 24 hours
    ).length;

    // Also count unread messages from Message collection
    const unreadDBMessages = await Message.countDocuments({
      group: groupName,
      sender: { $ne: username },
      isRead: false,
      timestamp: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });

    res.json({ unreadCount: unreadMessagesCount + unreadDBMessages });
  } catch (error) {
    console.error('Error fetching unread group messages:', error);
    res.status(500).json({ error: 'Error fetching unread group messages' });
  }
});

// Mark messages as read
router.put('/messages/read/:sender/:receiver', async (req, res) => {
  try {
    await Message.updateMany({ sender: req.params.sender, receiver: req.params.receiver }, { isRead: true });
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking messages as read:', error);  // Improved error logging
    res.status(500).json({ error: 'Error marking messages as read' });
  }
});

// Mark group messages as read
router.put('/groups/messages/read/:groupName/:username', async (req, res) => {
  try {
    const { groupName, username } = req.params;
    const group = await Group.findOne({ name: groupName });
    
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Mark all messages as read for this user
    group.messages = group.messages.map(msg => {
      if (msg.sender !== username) {
        msg.isRead = true;
      }
      return msg;
    });

    await group.save();
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking group messages as read:', error);
    res.status(500).json({ error: 'Error marking group messages as read' });
  }
});

// Get group messages
router.get('/groups/messages/:groupName', async (req, res) => {
  try {
    const { groupName } = req.params;
    
    // Find the group
    const group = await Group.findOne({ name: groupName });
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Get messages from both Message collection and group's messages array
    const messages = await Message.find({ group: groupName })
      .sort({ timestamp: 1 })
      .lean();

    // Combine with group's internal messages
    const allMessages = [
      ...messages,
      ...group.messages.map(msg => ({
        sender: msg.sender,
        message: msg.message,
        timestamp: msg.timestamp,
        isRead: msg.isRead
      }))
    ];

    // Sort by timestamp
    allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    res.json(allMessages);
  } catch (error) {
    console.error('Error fetching group messages:', error);
    res.status(500).json({ error: 'Error fetching group messages' });
  }
});

module.exports = router;
