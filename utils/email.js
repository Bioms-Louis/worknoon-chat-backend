const nodemailer = require("nodemailer");

// ── Create transporter ───────────────────────────
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ── Base send function ───────────────────────────
const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const info = await transporter.sendMail({
      from:    `"eCommerce Chat" <${process.env.EMAIL_FROM}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ""), // strip tags for text version
    });
    console.log(`📧 Email sent to ${to}: ${info.messageId}`);
    return info;
  } catch (err) {
    console.error("❌ Email send failed:", err.message);
    // Don't throw — email failure shouldn't break the request
  }
};

// ── Template: New message notification ──────────
exports.sendNewMessageEmail = async (recipient, sender, conversationId, preview) => {
  if (!recipient.notifyEmail) return;
  await sendEmail({
    to:      recipient.email,
    subject: `💬 New message from ${sender.name}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #6366f1;">You have a new message</h2>
        <p><strong>${sender.name}</strong> (${sender.role}) sent you a message:</p>
        <blockquote style="border-left: 3px solid #6366f1; padding: 8px 16px;
          background: #f5f5ff; border-radius: 4px; margin: 16px 0;">
          ${preview.length > 200 ? preview.slice(0, 200) + "…" : preview}
        </blockquote>
        <a href="${process.env.CLIENT_URL}/inbox/${conversationId}"
          style="display: inline-block; background: #6366f1; color: #fff;
          padding: 10px 24px; border-radius: 8px; text-decoration: none;
          font-weight: 600; margin-top: 8px;">
          View Message
        </a>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
          You can manage your notification preferences in your profile settings.
        </p>
      </div>
    `,
  });
};

// ── Template: Welcome email ──────────────────────
exports.sendWelcomeEmail = async (user) => {
  await sendEmail({
    to:      user.email,
    subject: "👋 Welcome to eCommerce Chat!",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h1 style="color: #6366f1;">Welcome, ${user.name}!</h1>
        <p>Your account has been created successfully with the role: 
          <strong>${user.role}</strong>.</p>
        <a href="${process.env.CLIENT_URL}/inbox"
          style="display: inline-block; background: #6366f1; color: #fff;
          padding: 10px 24px; border-radius: 8px; text-decoration: none;
          font-weight: 600;">
          Go to Inbox
        </a>
      </div>
    `,
  });
};

// ── Template: Conversation assigned ─────────────
exports.sendAssignedEmail = async (agent, customer, conversationId) => {
  await sendEmail({
    to:      agent.email,
    subject: `🎯 New conversation assigned to you`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #6366f1;">New Conversation Assigned</h2>
        <p>A conversation from <strong>${customer.name}</strong> has been assigned to you.</p>
        <a href="${process.env.CLIENT_URL}/inbox/${conversationId}"
          style="display: inline-block; background: #6366f1; color: #fff;
          padding: 10px 24px; border-radius: 8px; text-decoration: none;
          font-weight: 600;">
          Open Conversation
        </a>
      </div>
    `,
  });
};

module.exports = { ...module.exports, sendEmail };
