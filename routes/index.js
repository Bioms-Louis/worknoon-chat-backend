const router = require("express").Router();
const { protect, restrictTo } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const { upload, handleUploadError } = require("../middleware/uploadMiddleware");

const authCtrl   = require("../controllers/authController");
const userCtrl   = require("../controllers/userController");
const convoCtrl  = require("../controllers/conversationController");
const msgCtrl    = require("../controllers/messageController");
const notifCtrl  = require("../controllers/notificationController");

// ── Health check ─────────────────────────────────
router.get("/health", (req, res) =>
  res.json({ status: "ok", env: process.env.NODE_ENV, time: new Date() })
);

// ── Auth ─────────────────────────────────────────
router.post("/auth/signup",
  authCtrl.signupValidation, validate,
  authCtrl.signup
);
router.post("/auth/login",
  authCtrl.loginValidation, validate,
  authCtrl.login
);
router.get ("/auth/me",              protect, authCtrl.getMe);
router.patch("/auth/update-password", protect, authCtrl.updatePassword);

// ── Users ─────────────────────────────────────────
router.get  ("/users",          protect, restrictTo("admin"), userCtrl.getAllUsers);
router.get  ("/users/agents",   protect, userCtrl.getAssignableUsers);
router.get  ("/users/me",       protect, userCtrl.getMe);
router.patch("/users/me",       protect, userCtrl.updateMe);
router.post ("/users/me/avatar",
  protect,
  upload.single("avatar"),
  handleUploadError,
  userCtrl.uploadAvatar
);
router.get  ("/users/:id",      protect, userCtrl.getUserById);
router.patch("/users/:id",      protect, restrictTo("admin"), userCtrl.updateUser);
router.delete("/users/:id",     protect, restrictTo("admin"), userCtrl.deleteUser);

// ── Conversations ─────────────────────────────────
router.get   ("/conversations/stats", protect, restrictTo("admin"), convoCtrl.getStats);
router.get   ("/conversations",       protect, convoCtrl.getAll);
router.post  ("/conversations",       protect, convoCtrl.create);
router.get   ("/conversations/:id",   protect, convoCtrl.getOne);
router.patch ("/conversations/:id",   protect, convoCtrl.update);
router.delete("/conversations/:id",   protect, convoCtrl.remove);

// Mark all messages in a conversation as read
router.patch("/conversations/:id/read-all", protect, msgCtrl.markAllRead);

// ── Messages ─────────────────────────────────────
router.get("/conversations/:id/messages", protect, msgCtrl.getMessages);

// Send text or file message
router.post(
  "/conversations/:id/messages",
  protect,
  upload.single("file"),   // optional file attachment
  handleUploadError,
  msgCtrl.sendMessage
);

router.patch ("/messages/:id/read",  protect, msgCtrl.markRead);
router.delete("/messages/:id",       protect, msgCtrl.deleteMessage);

// ── Notifications ─────────────────────────────────
router.get  ("/notifications",              protect, notifCtrl.getAll);
router.patch("/notifications/read-all",     protect, notifCtrl.markAllRead);
router.patch("/notifications/:id/read",     protect, notifCtrl.markRead);
router.delete("/notifications/:id",         protect, notifCtrl.deleteOne);

module.exports = router;
