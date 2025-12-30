const nodemailer = require('nodemailer');

/**
 * Email Utility
 * Sends OTP verification emails using Nodemailer
 */

// Create transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/**
 * Send OTP email
 * @param {string} email - Recipient email
 * @param {string} otp - 6-digit OTP
 * @param {string} username - User's username
 */
const sendOTPEmail = async (email, otp, username) => {
  try {
    const mailOptions = {
      from: `"WhoRU Chat" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'WhoRU - Email Verification Code',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { text-align: center; color: #6366f1; margin-bottom: 30px; }
            .otp-box { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0; }
            .info { color: #666; font-size: 14px; line-height: 1.6; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 WhoRU Verification</h1>
            </div>
            <p>Hi <strong>${username}</strong>,</p>
            <p class="info">Welcome to WhoRU! Please verify your email address using the code below:</p>
            <div class="otp-box">${otp}</div>
            <p class="info">This code will expire in <strong>10 minutes</strong>.</p>
            <p class="info">If you didn't request this, please ignore this email.</p>
            <div class="footer">
              <p>© 2025 WhoRU - Anonymous Chat Platform</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Email sending failed: ${error.message}`);
    return { success: false, error: error.message };
  }
};

module.exports = { sendOTPEmail };
