/**
Middleware to check if the authenticated user has the 'admin' role.
This middleware MUST run AFTER the authenticateUser middleware,
as it relies on req.user being populated with { id, email, role }.*/
const checkAdminRole = (req, res, next) => {
  // Check if the authenticateUser middleware has run and attached user info
  // Specifically, check if the role is present on req.user
  if (!req.user || !req.user.role) {
    // This indicates an issue with middleware order or the authenticateUser middleware itself
    console.error(
      "checkAdminRole Error: req.user.role not found. Ensure authenticateUser runs first."
    );
    return res
      .status(401)
      .json({ message: "Unauthorized: User role information not available." });
  }

  // Check if the user's role is 'admin'
  if (req.user.role !== "admin") {
    // User is authenticated but does not have the required admin privileges
    return res.status(403).json({
      message: "Forbidden: Admin role required to access this resource.",
    });
  }

  // User is authenticated and has the admin role, proceed to the next middleware or route handler
  next();
};
module.exports = checkAdminRole;