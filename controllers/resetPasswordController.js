const crypto = require("crypto");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const User = require("../models/User");
require("dotenv").config();

// Password validation function
function validatePassword(password) {
  const passwordRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return passwordRegex.test(password)
    ? { valid: true, message: "Password is valid." }
    : { valid: false, message: "Password must meet the criteria." };
}

// Reset Password Request
async function requestPasswordReset(req, res) {
  try {
    if (!req.body.email)
      return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email: req.body.email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const token = crypto.randomBytes(20).toString("hex");
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

    await user.save();

    const transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    const mailOptions = {
  to: user.email,
  from: process.env.EMAIL_USER,
  subject: "Reset Your Password",
  text: `
Dear ${user.first_name || user.last_name || 'User'},

We received a request to reset the password for your account associated with this email address.

To proceed, please click the link below or paste it into your browser:

https://codemapuser.netlify.app/reset-password/${token}

If you did not request this password reset, you can safely ignore this email.

Best regards,  
 Codemap Team
  `.trim(),
};


    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: "Password reset email sent successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error sending email", error: error.message });
  }
}

// Handle Password Reset
async function resetPassword(req, res) {
  const { token } = req.params;
  const { newPassword, confirmPassword } = req.body;

  if (newPassword !== confirmPassword)
    return res.status(400).json({ message: "Passwords do not match" });

  const validationResult = validatePassword(newPassword);
  if (!validationResult.valid)
    return res.status(400).json({ message: validationResult.message });

  try {
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user)
      return res.status(400).json({ message: "Token is invalid or expired" });

    if (await bcrypt.compare(newPassword, user.password))
      return res.status(400).json({
        message: "New password cannot be the same as current password",
      });

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();
    res.status(200).json({ message: "Password successfully updated" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating password", error: error.message });
  }
}

module.exports = {
  requestPasswordReset,
  resetPassword,
};