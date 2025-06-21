const jwt = require("jsonwebtoken");
const User = require("../models/User"); // Ensure this path is correct

/**
 * Middleware to authenticate users using JWT.
 * Verifies the token provided in headers (Authorization: Bearer), cookies (jwt), or query parameters (token).
 * Attaches user information (id, email, role) to req.user upon successful authentication.
 */
const authenticateUser = async (req, res, next) => {
  let token;

  // 1. Check Authorization header (Bearer Token)
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }
  // 2. If not in header, check cookies
  else if (req.cookies?.jwt) {
    token = req.cookies.jwt;
  }
  // 3. If not in header or cookies, check query parameter (less common, consider security implications)
  // else if (req.query.token) {
  //   token = req.query.token;
  // }

  // Check if a token was found
  if (!token) {
    return res
      .status(401)
      .json({ message: "Access denied. No authentication token provided." });
  }

  try {
    // Verify the token using the access token secret
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    // Token is valid, find the user associated with the token's ID
    // Select necessary fields: email and role are needed for subsequent checks/logic
    const user = await User.findById(decoded.UserInfo.id)
      .select("email role")
      .lean(); // Use lean() for performance if not modifying user doc here

    // Check if the user still exists in the database
    if (!user) {
      // This could happen if the user was deleted after the token was issued
      return res.status(401).json({
        message:
          "Unauthorized. User associated with this token no longer exists.",
      });
    }

    // Attach user information (including role) to the request object
    // This makes user details available to subsequent middleware and route handlers
    req.user = { id: user._id.toString(), email: user.email, role: user.role };

    // Proceed to the next middleware or route handler
    next();
  } catch (err) {
    // Log the error for debugging purposes
    console.error("Authentication error:", err.message);

    // Handle specific JWT errors for clearer client feedback
    if (err.name === "JsonWebTokenError") {
      return res
        .status(401)
        .json({ message: "Invalid token. Please log in again." });
    } else if (err.name === "TokenExpiredError") {
      return res
        .status(401)
        .json({ message: "Token expired. Please log in again." });
    }

    // Generic error for other unexpected issues during authentication
    return res
      .status(500)
      .json({ message: "Internal server error during authentication." });
  }
};

module.exports = authenticateUser;