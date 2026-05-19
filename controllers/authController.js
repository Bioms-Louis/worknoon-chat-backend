const jwt  = require("jsonwebtoken");
const { body } = require("express-validator");
const User = require("../models/User");
const { sendWelcomeEmail } = require("../utils/email");

// ── Sign a JWT ───────────────────────────────────
const signToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

// ── Send token response ──────────────────────────
const sendTokenResponse = (user, statusCode, res) => {
  const token = signToken(user._id, user.role);
  res.status(statusCode).json({
    token,
    user: {
      id:       user._id,
      name:     user.name,
      email:    user.email,
      role:     user.role,
      avatar:   user.avatar,
      bio:      user.bio,
      isOnline: user.isOnline,
    },
  });
};

// ── Validation rules ─────────────────────────────
exports.signupValidation = [
  body("name")
    .trim()
    .notEmpty().withMessage("Name is required")
    .isLength({ max: 60 }).withMessage("Name too long"),
  body("email")
    .isEmail().withMessage("Valid email required")
    .normalizeEmail(),
  body("password")
    .isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  body("role")
    .optional()
    .isIn(["customer", "designer", "merchant"])
    .withMessage("Invalid role. Allowed: customer, designer, merchant"),
];

exports.loginValidation = [
  body("email").isEmail().withMessage("Valid email required").normalizeEmail(),
  body("password").notEmpty().withMessage("Password is required"),
];

// ── POST /api/auth/signup ────────────────────────
exports.signup = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Check duplicate
    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ message: "An account with that email already exists." });
    }

    // Prevent self-assigning admin/agent roles
    const safeRole = ["customer", "designer", "merchant"].includes(role)
      ? role
      : "customer";

    const user = await User.create({ name, email, password, role: safeRole });

    // Fire-and-forget welcome email
    sendWelcomeEmail(user).catch(() => {});

    sendTokenResponse(user, 201, res);
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Server error during signup." });
  }
};

// ── POST /api/auth/login ─────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "Your account has been deactivated." });
    }

    sendTokenResponse(user, 200, res);
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error during login." });
  }
};

// ── GET /api/auth/me ─────────────────────────────
exports.getMe = async (req, res) => {
  const user = await User.findById(req.user._id);
  res.json({
    id:       user._id,
    name:     user.name,
    email:    user.email,
    role:     user.role,
    avatar:   user.avatar,
    bio:      user.bio,
    isOnline: user.isOnline,
    notifyEmail: user.notifyEmail,
    notifyPush:  user.notifyPush,
    createdAt: user.createdAt,
  });
};

// ── PATCH /api/auth/update-password ─────────────
exports.updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Both currentPassword and newPassword are required." });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters." });
    }

    const user = await User.findById(req.user._id).select("+password");
    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({ message: "Current password is incorrect." });
    }

    user.password = newPassword;
    await user.save();
    sendTokenResponse(user, 200, res);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
