require("dotenv").config();
const mongoose = require("mongoose");
const User     = require("../models/User");
const Conversation = require("../models/Conversation");
const Message      = require("../models/Message");

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  // Clean existing
  await User.deleteMany({});
  await Conversation.deleteMany({});
  await Message.deleteMany({});
  console.log("Cleared existing data");

  //  Create users 
  const users = await User.create([
    { name: "Admin User",    email: "admin@test.com",    password: "password123", role: "admin"    },
    { name: "Louis (Agent)", email: "agent@test.com",    password: "password123", role: "agent"    },
    { name: "Favour (Customer)", email: "customer@test.com", password: "password123", role: "customer" },
    { name: "Chris (Designer)", email: "designer@test.com", password: "password123", role: "designer" },
    { name: "Precious (Merchant)", email: "merchant@test.com", password: "password123", role: "merchant" },
  ]);

  const [admin, agent, customer, designer, merchant] = users;
  console.log("✅ Users created");

  //  Create conversations 
  const [c1, c2, c3] = await Conversation.create([
    { participants: [customer._id, agent._id],    type: "support"  },
    { participants: [customer._id, designer._id], type: "designer" },
    { participants: [customer._id, merchant._id], type: "merchant" },
  ]);
  console.log("✅ Conversations created");

  //  Create messages 
  const msgs1 = await Message.create([
    { conversation: c1._id, sender: agent._id,    content: "Hi Louis! How can I help you today?",       type: "text", readBy: [agent._id, customer._id] },
    { conversation: c1._id, sender: customer._id, content: "I have a question about my order #4521.",  type: "text", readBy: [agent._id, customer._id] },
    { conversation: c1._id, sender: agent._id,    content: "I'll check on that order for you right away!", type: "text", readBy: [agent._id] },
  ]);

  await Conversation.findByIdAndUpdate(c1._id, {
    lastMessage: msgs1[msgs1.length - 1]._id,
    unreadCount: { [customer._id.toString()]: 1 },
  });

  const msgs2 = await Message.create([
    { conversation: c2._id, sender: designer._id, content: "Hello! I've started working on your product page redesign.", type: "text", readBy: [designer._id, customer._id] },
    { conversation: c2._id, sender: customer._id, content: "Great! When can I expect a preview?", type: "text", readBy: [designer._id, customer._id] },
  ]);

  await Conversation.findByIdAndUpdate(c2._id, {
    lastMessage: msgs2[msgs2.length - 1]._id,
  });

  console.log("✅ Messages created");
  console.log("\n🌱 Seed complete! Test credentials:");
  console.log("   admin@test.com    / password123  (admin)");
  console.log("   agent@test.com    / password123  (agent)");
  console.log("   customer@test.com / password123  (customer)");
  console.log("   designer@test.com / password123  (designer)");
  console.log("   merchant@test.com / password123  (merchant)");

  await mongoose.disconnect();
  process.exit(0);
};

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
