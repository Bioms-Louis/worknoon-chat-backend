require("dotenv").config();
const express    = require("express");
const http       = require("http");
const { Server } = require("socket.io");
const cors       = require("cors");
const helmet     = require("helmet");
const morgan     = require("morgan");
const path       = require("path");

const connectDB      = require("./config/db");
const routes         = require("./routes");
const socketHandler  = require("./sockets");

//  App & HTTP server 
const app    = express();
const server = http.createServer(app);

//  Socket.IO 
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL.split(','),
    credentials: true,
  },
  pingTimeout:  60000,
  pingInterval: 25000,
});

//  Core middleware 
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({
  origin: process.env.CLIENT_URL.split(','),
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Logging: concise in production, verbose in dev
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

//  Static files (local fallback if not using Cloudinary) 
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

//  API routes 
app.use("/api", routes);

// 404 handler 
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.originalUrl} not found.` });
});

//  Global error handler 
app.use((err, req, res, next) => {
  console.error("💥 Unhandled error:", err.stack);
  res.status(err.status || 500).json({
    message: process.env.NODE_ENV === "production"
      ? "Something went wrong. Please try again."
      : err.message,
  });
});

//  Socket.IO handlers 
socketHandler(io);

//  Start server 
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 Socket.IO ready`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}\n`);
  });
});

//  Graceful shutdown 
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully…");
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
});

module.exports = { app, io };
