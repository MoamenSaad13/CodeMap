const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const passport = require("passport"); // Import passport
const jwt = require("jsonwebtoken"); // To generate JWT on successful Google auth

// --- Standard Authentication Routes --- 

// User Registration
router.route("/register").post(authController.register);

// User Login (Email/Password)
router.route("/login").post(authController.login);

// Refresh JWT Token
router.route("/refresh").get(authController.refresh);

// User Logout
router.route("/logout").post(authController.logout);

// --- Google OAuth 2.0 Routes --- 

// Route to initiate Google Authentication
// This redirects the user to Google's consent screen.
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"], // Request profile and email
    session: false, // We are using JWT, not sessions
  })
);

// Google OAuth Callback Route
// Google redirects the user back to this URL after authentication.
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/login/failed", // Redirect on failure (adjust URL as needed for frontend)
    session: false, // We are using JWT, not sessions
  }),
  (req, res) => {
    // Successful authentication, `req.user` contains the user object from the verify callback.
    console.log("Google callback successful, user:", req.user);

    // Generate JWT tokens (Access and Refresh)
    const accessToken = jwt.sign(
      {
        UserInfo: {
          id: req.user._id,
          email: req.user.email,
          role: req.user.role,
        },
      },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "15m" } // Adjust expiry as needed
    );

    const refreshToken = jwt.sign(
      { email: req.user.email, id: req.user._id }, // Include ID in refresh token
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: "7d" } // Adjust expiry as needed
    );

    // Send refresh token as HTTP-only cookie
    res.cookie("jwt", refreshToken, {
      httpOnly: true, // Accessible only by web server
      secure: true, // https
      sameSite: "None", // cross-site cookie
      maxAge: 7 * 24 * 60 * 60 * 1000, // cookie expiry: set to match rT
    });

    // Send accessToken containing username and roles
    // Instead of redirecting, send tokens back as JSON for backend-only API
    res.json({ 
        message: "Google authentication successful",
        accessToken, 
        user: { // Send some user info back
            id: req.user._id,
            email: req.user.email,
            first_name: req.user.first_name,
            last_name: req.user.last_name,
            role: req.user.role,
            profile_image: req.user.profile_image
        }
    });

    // --- Alternative: Redirect back to frontend with tokens --- 
    // If you have a frontend, you might redirect like this:
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/auth/success?token=${accessToken}`); // Pass token in query param (or handle differently)
  }
);

// Optional: Route for handling login failures (e.g., user denied access)
router.get("/login/failed", (req, res) => {
  res.status(401).json({
    success: false,
    message: "Google authentication failed.",
  });
});

module.exports = router;