const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, index: true },  // Added index
    password: { type: String, required: true }, 
    username: { type: String, required: true, unique: true, index: true },  // Added index
    contact: [String]
});

const User = mongoose.model("User", userSchema);
module.exports = User;
