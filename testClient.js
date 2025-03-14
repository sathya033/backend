const io = require("socket.io-client");

const socket = io("http://localhost:3000", {
  query: { username: "userA" }
});

socket.on("connect", () => {
  console.log("Connected as userA");
  
  // Send a private message
  socket.emit("send_private_message", {
    sender: "userA",
    receiver: "userB",
    message: "Hello User B!"
  });

  // Listen for incoming messages
  socket.on("receive_private_message", (data) => {
    console.log("📩 New Message:", data);
  });
});

// Simulate unread messages check
socket.on("unread_count", (count) => {
  console.log(" Unread messages:", count);
});