const User = require("../models/User");
const { uploadToCloudinary, deleteFromCloudinary } = require("../middleware/uploadMiddleware");

// ── GET /api/users  (admin only) ─────────────────
exports.getAllUsers = async (req, res) => {
  try {
    const { role, search, page = 1, limit = 20 } = req.query;

    const query = { isActive: true };
    if (role)   query.role = role;
    if (search) query.name = { $regex: search, $options: "i" };

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select("-password -pushToken")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    res.json({ users, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/users/agents  (get available agents/designers/merchants) ──
exports.getAssignableUsers = async (req, res) => {
  try {
    const { role } = req.query; // e.g. ?role=agent
    const validRoles = ["agent", "designer", "merchant", "admin"];
    const rolesFilter = role && validRoles.includes(role) ? [role] : validRoles;

    const users = await User.find({ role: { $in: rolesFilter }, isActive: true })
      .select("name email role avatar isOnline lastSeen")
      .sort({ isOnline: -1, name: 1 });

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/users/me ────────────────────────────
exports.getMe = async (req, res) => {
  const user = await User.findById(req.user._id).select("-password -pushToken");
  res.json(user);
};

// ── PATCH /api/users/me ──────────────────────────
exports.updateMe = async (req, res) => {
  try {
    const allowed = ["name", "bio", "notifyEmail", "notifyPush"];
    const updates = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    }).select("-password -pushToken");

    res.json(user);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ── POST /api/users/me/avatar ────────────────────
exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded." });
    }

    const user = await User.findById(req.user._id);

    // Delete old avatar from Cloudinary if exists
    if (user.avatarPublicId) {
      await deleteFromCloudinary(user.avatarPublicId).catch(() => {});
    }

    // Upload new one
    const result = await uploadToCloudinary(req.file.buffer, "avatars", "image");

    user.avatar        = result.secure_url;
    user.avatarPublicId = result.public_id;
    await user.save();

    res.json({ avatar: user.avatar });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/users/:id  (admin or self) ──────────
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password -pushToken");
    if (!user) return res.status(404).json({ message: "User not found." });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── PATCH /api/users/:id  (admin only) ───────────
exports.updateUser = async (req, res) => {
  try {
    const allowed = ["name", "role", "isActive", "notifyEmail", "notifyPush"];
    const updates = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const user = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).select("-password -pushToken");

    if (!user) return res.status(404).json({ message: "User not found." });
    res.json(user);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ── DELETE /api/users/:id  (admin only) ──────────
exports.deleteUser = async (req, res) => {
  try {
    // Soft delete — keep data, just deactivate
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found." });
    res.json({ message: "User deactivated successfully." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
