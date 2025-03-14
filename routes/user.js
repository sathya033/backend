const express = require('express');
const router = express.Router();
const User = require('../models/user'); 

router.get('/users', async (req, res) => {
  try {
    const users = await User.find({}, 'username').lean();  // Use lean() for faster read
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);  // Improved error logging
    res.status(500).json({ error: 'Error fetching users' });
  }
});

module.exports = router;
