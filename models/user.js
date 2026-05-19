const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [60, "Name cannot exceed 60 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/\S+@\S+\.\S+/, "Please enter a valid email"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false, // never returned in queries by default
    },
    role: {
      type: String,
      enum: ["admin", "agent", "customer", "designer", "merchant"],
      default: "customer",
    },
    avatar: {
      type: String,
      default: "",
    },
    avatarPublicId: {
      type: String,
      default: "",
    },
    bio: {
      type: String,
      maxlength: [200, "Bio cannot exceed 200 characters"],
      default: "",
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    pushToken: {
      type: String,
      default: "",
    },
    // Notification preferences
    notifyEmail: { type: Boolean, default: true },
    notifyPush:  { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Hash password before saving ──────────────────
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ── Instance method: compare passwords ──────────
userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ── Virtual: public profile (safe to expose) ────
userSchema.virtual("profile").get(function () {
  return {
    id:       this._id,
    name:     this.name,
    email:    this.email,
    role:     this.role,
    avatar:   this.avatar,
    bio:      this.bio,
    isOnline: this.isOnline,
    lastSeen: this.lastSeen,
  };
});

module.exports = mongoose.model("User", userSchema);
