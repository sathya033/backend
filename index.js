const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config();
const chatRoutes = require("./routes/chat");
const userRoutes = require("./routes/user");

// Initialize Express
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "http://localhost:4200" }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    // useNewUrlParser: true,
    // useUnifiedTopology: true,
  })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.log("❌ MongoDB Connection Error:", err));

// Import Models after DB connection
const User = require("./models/user");
const Message = require("./models/Message");
const Group = require("./models/Group");

// Mount Routes
app.use("/chat", chatRoutes);
app.use("/api", userRoutes);

// Chat Schema (Move this to models if necessary)
const chatSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  message: String,
  group: String,
  isRead: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now },
});
const Chat = mongoose.model("Chat", chatSchema);

// Fetch Messages
app.get("/messages", async (req, res) => {
  const { group, toUser, fromUser } = req.query;
  try {
    let messages;
    if (group) {
      messages = await Chat.find({ group }).sort({ timestamp: 1 });
    } else if (toUser && fromUser) {
      messages = await Chat.find({
        $or: [
          { sender: fromUser, receiver: toUser },
          { sender: toUser, receiver: fromUser },
        ],
      }).sort({ timestamp: 1 });
    } else {
      messages = await Chat.find().sort({ timestamp: 1 });
    }
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// Create Group
app.post('/groups/create', async (req, res) => {
  try {
    console.log("🔹 Request body:", req)
    const { groupName , admin } = req.body;

    if (!groupName) return res.status(400).json({ error: "Group name is required" });

    const existingGroup = await Group.findOne({ name: groupName });
    if (existingGroup) return res.status(400).json({ error: "Group already exists" });

    const newGroup = new Group({ name: groupName, members: [admin] ,admin: admin,messages:[]});
    await newGroup.save();

    res.status(201).json({ success: true, message: "Group created successfully", group: newGroup });
  } catch (error) {
    console.error("Error creating group:", error);
    res.status(500).json({ error: "Failed to create a group" });
  }
});

//add user to group
app.post("/groups/addUser", async (req, res) => {
  try {
    console.log("🔹 Request body:", req.body);

    const { groupName, username } = req.body;
    if (!groupName || !username) {
      console.error(" Missing groupName or username");
      return res.status(400).json({ error: "Missing groupName or username" });
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

// Fetch Groups
app.get("/groups", async (req, res) => {
  try {
    const groups = await Group.find().populate("members", "username");
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch groups" });
  }
});

app.put("/groups/userMessage", async (req, res) => {
  console.log("🔹 Request body:", req.body);
  const { group, sender, message } = req.body;

  try {
    const groups = await Group.findOne({ name:group});
    console.log("🔹 Group:", groups);
    if (!groups) {
      return res.status(404).json({ error: "Group not found" });
    }

    groups.messages.push({
      sender,
      message,
      timestamp: Date.now(),
      isRead: false
    });

    await groups.save();

    res.status(200).json({
      success: true,
      message: "Message sent successfully",
      data: groups.messages[groups.messages.length - 1]
    });

  } catch (error) {
    console.error("❌ Error sending message:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// Fetch Users
app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find({}, "username");
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Socket.IO Implementation
const connectedUsers = new Map(); // Store connected users and their socket IDs

io.on("connection", async (socket) => {
  console.log("🔌 New user connected:", socket.id);

  // Handle user connection
  socket.on('user_connected', async (data) => {
    const { username } = data;
    connectedUsers.set(username, socket.id);
    socket.username = username;

    // Broadcast online users to all connected clients
    const onlineUsers = Array.from(connectedUsers.keys());
    io.emit('users_online', onlineUsers);
    
    console.log(` User ${username} connected`);
  });

  // Join private chat room
  socket.on('join_private_chat', ({ otherUser }) => {
    const roomName = [socket.username, otherUser].sort().join('-');
    socket.join(roomName);
    console.log(`👥 ${socket.username} joined private chat with ${otherUser}`);
  });

  // Join group chat room
  socket.on('join_group', async ({ group, user }) => {
    try {
      const groupData = await Group.findOne({ name: group });
      if (groupData && groupData.members.includes(user)) {
        socket.join(group);
        // console.log(`👥 ${user} joined group: ${group}`);
        
        // Send group chat history
        const messages = await Message.find({ group })
          .sort({ timestamp: 1 })
          .limit(100);
        socket.emit('group_chat_history', messages);
      }
    } catch (error) {
      console.error('Error joining group:', error);
    }
  });

  // Leave group chat room
  socket.on('leave_group', ({ group, user }) => {
    socket.leave(group);
    // console.log(`👋 ${user} left group: ${group}`);
  });

  // Handle private messages
  socket.on('send_private_message', async (data) => {
    try {
      const { sender, receiver, message } = data;
      
      // Save message to database
      const newMessage = new Message({
        sender,
        receiver,
        message,
        timestamp: new Date(),
        isRead: false
      });
      await newMessage.save();

      // Get receiver's socket ID
      const receiverSocketId = connectedUsers.get(receiver);
      
      // Send to receiver if online
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('receive_private_message', newMessage);
      }
      
      // Send back to sender
      socket.emit('receive_private_message', newMessage);
      
      // console.log(` Private message sent from ${sender} to ${receiver}`);
    } catch (error) {
      console.error('Error sending private message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Handle group messages
  socket.on('send_group_message', async (data) => {
    try {
      const { sender, group, message } = data;
      
      // Verify group membership
      const groupData = await Group.findOne({ name: group });
      if (!groupData || !groupData.members.includes(sender)) {
        return socket.emit('error', { message: 'Not authorized to send message to this group' });
      }

      // Save message to database
      const newMessage = new Message({
        sender,
        group,
        message,
        timestamp: new Date()
      });
      await newMessage.save();

      // Update group's messages array
      groupData.messages.push({
        sender,
        message,
        timestamp: new Date()
      });
      await groupData.save();

      // Broadcast to all group members
      io.to(group).emit('receive_group_message', newMessage);
      
      // console.log(`📨 Group message sent to ${group} by ${sender}`);
    } catch (error) {
      console.error('Error sending group message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Handle typing indicators
  socket.on('typing', (data) => {
    const receiverSocketId = connectedUsers.get(data.receiver);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('user_typing', { sender: data.sender });
    }
  });

  socket.on('stop_typing', (data) => {
    const receiverSocketId = connectedUsers.get(data.receiver);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('userStoppedTyping', { sender: data.sender });
    }
  });

  socket.on('typing_group', (data) => {
    socket.to(data.group).emit('user_typing_group', data);
  });

  socket.on('stop_typing_group', (data) => {
    socket.to(data.group).emit('userStoppedTyping_group', data);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    if (socket.username) {
      connectedUsers.delete(socket.username);
      // Broadcast updated online users list
      const onlineUsers = Array.from(connectedUsers.keys());
      io.emit('users_online', onlineUsers);
      console.log(`❌ User ${socket.username} disconnected`);
    }
  });
});

app.post("/register", async (req, res) => {
  const { email, password, username } = req.body;
  try {
    if (await User.findOne({ email })) return res.status(400).json({ error: "User already exists" });
    if (await User.findOne({ username })) return res.status(400).json({ error: "Username already taken" });

    const newUser = new User({ email, password, username });
    await newUser.save();
    res.json({ message: "Registration successful", user: { email, username } });
  } catch (error) {
    res.status(500).json({ error: "Failed to register user" });
  }
});

app.post("/login", async (req, res) => {
  const { emailOrUsername, password } = req.body;
  try {
    const user = await User.findOne({
      $or: [{ email: emailOrUsername }, { username: emailOrUsername }],
      password
    });
    if (!user) {
      return res.status(401).json({ error: "Invalid email/username or password" });
    }
    res.json({ user: { email: user.email, username: user.username } });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

fetch('http://localhost:5000')
  .then(res => console.log("Connected:", res.status))
  .catch(err => console.error("Connection error:", err));

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));



