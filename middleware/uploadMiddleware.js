const multer     = require("multer");
const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");

// ── Allowed MIME types ───────────────────────────
const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "application/zip",
];

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

// ── Use memory storage (buffer → Cloudinary stream)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed: ${file.mimetype}`), false);
  }
};

exports.upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE },
});

// ── Upload buffer to Cloudinary ──────────────────
exports.uploadToCloudinary = (fileBuffer, folder, resourceType = "auto") => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `ecommerce-chat/${folder}`,
        resource_type: resourceType,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
};

// ── Delete from Cloudinary ───────────────────────
exports.deleteFromCloudinary = (publicId, resourceType = "image") => {
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
};

// ── Multer error handler middleware ─────────────
exports.handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "File too large. Maximum size is 10MB." });
    }
    return res.status(400).json({ message: err.message });
  }
  if (err) {
    return res.status(400).json({ message: err.message });
  }
  next();
};
