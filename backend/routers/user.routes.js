const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { userModel } = require("../features/model/user.model");
const { authenticate, isAdmin } = require("../middleware/auth.middleware");

const router = express.Router();
router.use(express.json());

// signup route
router.post("/sign", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Input validation
    if (!name || !email || !password) {
      return res.status(400).json({
        ok: false,
        msg: "Please provide name, email and password"
      });
    }

    // Check if user exists
    const existingUser = await userModel.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        ok: false,
        msg: "Email already registered"
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Assign role: Default to 'user', but check if email matches ADMIN_EMAIL in .env
    let userRole = role === 'admin' ? 'admin' : 'user';
    if (process.env.ADMIN_EMAIL && email === process.env.ADMIN_EMAIL) {
      userRole = 'admin';
    }

    const user = new userModel({
      name,
      email,
      password: hashedPassword,
      role: userRole
    });

    await user.save();

    // Generate token for immediate login
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: "24h" }
    );

    // Save token to track active session
    user.activeToken = token;
    user.lastLogin = new Date();
    user.isOnline = true;
    await user.save();

    res.status(201).json({
      ok: true,
      msg: "Registration successful",
      token,
      user_details: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, msg: "Registration failed" });
  }
});

// login route
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ ok: false, msg: "Please provide email and password" });
    }

    const user = await userModel.findOne({ email });

    if (!user) {
      return res.status(404).json({ ok: false, msg: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ ok: false, msg: "Invalid credentials" });
    }

    // Auto-promote to admin if email matches environment variable (fix for existing users)
    if (process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL && user.role !== 'admin') {
      user.role = 'admin';
      await user.save();
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: "24h" }
    );

    // Update login tracking and active session token
    user.lastLogin = new Date();
    user.isOnline = true;
    user.activeToken = token;
    await user.save();

    res.status(200).json({
      ok: true,
      msg: "Login successful",
      user_details: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      token
    });
  } catch (err) {
    res.status(500).json({ ok: false, msg: "Login failed" });
  }
});

// logout route
router.post("/logout", authenticate, async (req, res) => {
  try {
    const user = await userModel.findById(req.user._id);
    if (user) {
      // Calculate time spent since last login
      if (user.lastLogin) {
        const sessionDuration = (new Date() - new Date(user.lastLogin)) / 1000; // in seconds
        user.totalTimeSpent += Math.floor(sessionDuration);
      }
      user.isOnline = false;
      user.activeToken = null; // Invalidate current session on logout
      await user.save();
    }
    res.status(200).json({ ok: true, msg: "Logout successful" });
  } catch (err) {
    res.status(500).json({ ok: false, msg: "Logout failed" });
  }
});

// ADMIN ROUTES
router.get("/admin/stats", authenticate, isAdmin, async (req, res) => {
  try {
    const INACTIVE_THRESHOLD = 30 * 60 * 1000; // 30 minutes in milliseconds
    const now = new Date();

    // Mark inactive users as offline (users who closed browser without logout)
    const inactiveUsers = await userModel.find({
      isOnline: true,
      lastLogin: { $lt: new Date(now - INACTIVE_THRESHOLD) }
    });

    for (const user of inactiveUsers) {
      // Calculate session time before marking offline
      if (user.lastLogin) {
        const sessionDuration = (now - new Date(user.lastLogin)) / 1000;
        user.totalTimeSpent = (user.totalTimeSpent || 0) + Math.floor(sessionDuration);
      }
      user.isOnline = false;
      user.activeToken = null;
      await user.save();
    }

    const query = { role: { $ne: 'admin' } };
    const totalUsers = await userModel.countDocuments(query);
    const activeUsers = await userModel.countDocuments({ ...query, isOnline: true });

    // Calculate total time including current active sessions
    const users = await userModel.find(query).select('totalTimeSpent lastLogin isOnline');
    let totalTimeSeconds = 0;

    users.forEach(u => {
      let time = u.totalTimeSpent || 0;
      if (u.isOnline && u.lastLogin) {
        time += (now - new Date(u.lastLogin)) / 1000;
      }
      totalTimeSeconds += time;
    });

    res.status(200).json({
      ok: true,
      totalUsers,
      activeUsers,
      totalTimeSeconds: Math.floor(totalTimeSeconds)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: "Failed to fetch stats" });
  }
});

router.get("/admin/users", authenticate, isAdmin, async (req, res) => {
  try {
    // Fetch all non-admin users (includes legacy users without role field)
    const users = await userModel.find({ role: { $ne: 'admin' } })
      .select('-password')
      .lean(); // Convert to plain JS objects to allow modification

    // Calculate live time for online users
    const now = new Date();
    users.forEach(user => {
      if (user.isOnline && user.lastLogin) {
        const currentSessionSeconds = (now - new Date(user.lastLogin)) / 1000;
        user.totalTimeSpent = (user.totalTimeSpent || 0) + currentSessionSeconds;
      }
    });

    // Sort by last login (most recent first)
    users.sort((a, b) => new Date(b.lastLogin || 0) - new Date(a.lastLogin || 0));

    res.status(200).json({ ok: true, users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: "Failed to fetch users" });
  }
});

router.delete("/admin/user/:id", authenticate, isAdmin, async (req, res) => {
  try {
    await userModel.findByIdAndDelete(req.params.id);
    res.status(200).json({ ok: true, msg: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ ok: false, msg: "Failed to delete user" });
  }
});

module.exports = router;
