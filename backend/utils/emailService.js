const nodemailer = require("nodemailer");

/**
 * Creates Nodemailer transporter using environment configuration.
 * Returns null if SMTP variables are not fully configured.
 */
function createTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  const port = Number(SMTP_PORT);
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

/**
 * Sends a password reset email to the specified user.
 * Fails gracefully if SMTP is not configured.
 */
async function sendPasswordResetEmail({ to, resetUrl, firstname }) {
  const transporter = createTransporter();
  const fromAddress = process.env.SMTP_FROM || `"Velocity Security" <noreply@velocity.com>`;
  const greeting = firstname ? `Hello ${firstname},` : "Hello,";

  if (!transporter) {
    if (process.env.NODE_ENV === "development") {
      console.log("[AUTH DEV MODE] Password reset email simulated (SMTP not configured).");
    } else if (process.env.NODE_ENV === "production") {
      console.warn("[AUTH WARNING] SMTP credentials not configured. Password reset email could not be delivered.");
    }
    return { sent: false, reason: "SMTP not configured" };
  }

  const mailOptions = {
    from: fromAddress,
    to,
    subject: "Velocity — Password Reset Request",
    text: `${greeting}\n\nA request was received to reset your password for your Velocity account.\n\nPlease visit the following link to set a new password:\n${resetUrl}\n\nThis link is valid for 20 minutes.\nIf you did not request this, you can safely ignore this email.\n\n— The Velocity Team`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #0f172a; margin-bottom: 16px;">Reset Your Velocity Password</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.5;">${greeting}</p>
        <p style="color: #475569; font-size: 15px; line-height: 1.5;">
          We received a request to reset the password for your Velocity account. Click the button below to choose a new password:
        </p>
        <div style="margin: 28px 0; text-align: center;">
          <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="color: #64748b; font-size: 13px; line-height: 1.4;">
          This link will expire in <strong>20 minutes</strong> and can only be used once.
        </p>
        <p style="color: #64748b; font-size: 13px; line-height: 1.4;">
          If the button does not work, copy and paste this link into your browser:<br />
          <a href="${resetUrl}" style="color: #2563eb; word-break: break-all;">${resetUrl}</a>
        </p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px;">
          If you did not request a password reset, no action is needed. Your account remains secure.
        </p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { sent: true };
  } catch (error) {
    console.error("[AUTH ERROR] Failed to send password reset email:", error.message);
    return { sent: false, reason: "Delivery failed" };
  }
}

module.exports = {
  createTransporter,
  sendPasswordResetEmail,
};
