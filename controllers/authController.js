const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const NotificationService = require("../services/notificationService"); // Import NotificationService

// Helper function for password validation
const validatePassword = (password) => {
  const errors = [];
  if (password.length < 8) {
    errors.push("Password must be at least 8 characters long.");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter.");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter.");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number.");
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};\'\"\\|,.<>\/?]+/.test(password)) {
    errors.push("Password must contain at least one special character.");
  }
  return errors;
};

const register = async (req, res) => {
  const { first_name, last_name, email, password } = req.body;
  if (!first_name || !last_name || !email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  // Validate password complexity
  const passwordErrors = validatePassword(password);
  if (passwordErrors.length > 0) {
    return res.status(400).json({ message: "Password validation failed", errors: passwordErrors });
  }

  const foundUser = await User.findOne({ email }).exec();
  if (foundUser) {
    return res.status(401).json({ message: "User already exists" });
  }
  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    first_name,
    last_name,
    email,
    password: hashedPassword,
  });

  // --- Notification: New User Registration ---
  try {
    await NotificationService.createNotification({
      type: "system",
      title: "Welcome to CodeMap!",
      message: `Hello ${user.first_name} ${user.last_name}! Welcome to CodeMap. Start your journey by exploring our roadmaps and finding the perfect learning path for you.`,
      assignedTo: user._id,
      actions: [
        {
          label: "Explore Roadmaps",
          action: "view",
          url: "/roadmaps",
          style: "primary",
        },
        {
          label: "Complete Profile",
          action: "view",
          url: "/profile",
          style: "secondary",
        },
      ],
      metadata: {
        welcomeNotification: true,
        registrationDate: new Date()
      }
    });
    console.log(`Welcome notification sent to user: ${user.email}`);
  } catch (error) {
    console.error("Error sending welcome notification:", error);
  }
  // --- End Notification ---

  const accessToken = jwt.sign(
    {
      UserInfo: {
        id: user._id,
      },
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "15m" }
  );
  const refreshToken = jwt.sign(
    {
      UserInfo: {
        id: user._id,
      },
    },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: "7d" }
  );
  res.cookie("jwt", refreshToken, {
    httpOnly: true, //accessible only by web server
    secure: true, //https
    sameSite: "None", //cross-site cookie
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.status(201).json({
    accessToken,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
  });
};

const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }
  const foundUser = await User.findOne({ email }).exec();
  if (!foundUser) {
    return res.status(401).json({ message: "User does not exist" });
  }
  const match = await bcrypt.compare(password, foundUser.password);

  if (!match) return res.status(401).json({ message: "Wrong Password" });

  // --- Notification: Security Alert During Login (Example - you'd add logic to detect unusual patterns) ---
  try {
    // Example: Check for unusual login patterns (e.g., new IP, new device, unusual location)
    // For demonstration, let's assume a simple check or always send for now.
    // In a real app, you'd have a more sophisticated detection mechanism.
    const loginData = {
      ipAddress: req.ip, // Or get from a more reliable source if behind proxy
      userAgent: req.headers['user-agent'],
      location: "Unknown", // You'd use a geo-IP service here
    };

    // You would implement a function like this:
    // const isUnusual = await detectUnusualLoginPattern(foundUser._id, loginData);
    // if (isUnusual) {
      await NotificationService.createNotification({
        type: "security",
        title: "🔒 Security Alert: New Login Detected",
        message: `Hello ${foundUser.first_name}, we detected a new login to your account from ${loginData.location || 'Unknown location'} at ${new Date().toLocaleString()}. If this was you, you can ignore this message. If not, please secure your account immediately.`,
        assignedTo: foundUser._id,
        actions: [
          {
            label: "Secure Account",
            action: "view",
            url: "/security",
            style: "danger",
          },
          {
            label: "Change Password",
            action: "view",
            url: "/change-password",
            style: "warning",
          },
        ],
        metadata: {
          securityAlert: true,
          loginTime: new Date(),
          ipAddress: loginData.ipAddress,
          userAgent: loginData.userAgent,
          location: loginData.location
        }
      });
      console.log(`Security alert sent to user: ${foundUser.email}`);
    // }
  } catch (error) {
    console.error("Error sending security alert:", error);
  }
  // --- End Notification ---

  const accessToken = jwt.sign(
    {
      UserInfo: {
        id: foundUser._id,
      },
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "15m" }
  );
  const refreshToken = jwt.sign(
    {
      UserInfo: {
        id: foundUser._id,
      },
    },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: "7d" }
  );
  res.cookie("jwt", refreshToken, {
    httpOnly: true, //accessible only by web server
    secure: true, //https
    sameSite: "None", //cross-site cookie
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({
    accessToken,
    email: foundUser.email,
    role: foundUser.role,
    first_name: foundUser.first_name,
    last_name: foundUser.last_name, 
    id: foundUser._id,
  });
};

const refresh = (req, res) => {
  const cookies = req.cookies;
  if (!cookies?.jwt) return res.status(401).json({ message: "Unauthorized" });
  const refreshToken = cookies.jwt;
  jwt.verify(
    refreshToken,
    process.env.REFRESH_TOKEN_SECRET,
    async (err, decoded) => {
      if (err) return res.status(403).json({ message: "Forbidden" });
      const foundUser = await User.findById(decoded.UserInfo.id).exec();
      if (!foundUser) return res.status(401).json({ message: "Unauthorized" });
      const accessToken = jwt.sign(
        {
          UserInfo: {
            id: foundUser._id,
          },
        },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "15m" }
      );
      res.json({ accessToken });
    }
  );
};

const logout = (req, res) => {
  const cookies = req.cookies;
  if (!cookies?.jwt) return res.sendStatus(204); //No content
  res.clearCookie("jwt", {
    httpOnly: true,
    sameSite: "None",
    secure: true,
  });
  res.json({ message: "you have been logout successfully" });
};
module.exports = {
  register,
  login,
  refresh,
  logout,
};


