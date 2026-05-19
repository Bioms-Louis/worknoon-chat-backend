const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10,
      minPoolSize: 2,  
      maxIdleTimeMS: 30000,
      connectTimeoutMS: 10000,  
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      retryWrites: true,
    });

    console.log(`✅ MongoDB Atlas connected: ${conn.connection.host}`);
    console.log(`   Database: ${conn.connection.name}`);
  } catch (err) {
    console.error(`❌ MongoDB connection error: ${err.message}`);
    console.error(
      "   Check: MONGO_URI in .env, IP whitelist in Atlas Network Access, and DB user credentials."
    );
    process.exit(1);
  }
};

// Connection lifecycle events 
mongoose.connection.on("disconnected", () =>
  console.warn("⚠️  MongoDB Atlas disconnected — will auto-retry")
);
mongoose.connection.on("reconnected", () =>
  console.log("🔄 MongoDB Atlas reconnected")
);
mongoose.connection.on("error", (err) =>
  console.error("💥 MongoDB error:", err.message)
);

module.exports = connectDB;
