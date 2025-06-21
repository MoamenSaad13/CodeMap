require("dotenv").config();
const express = require("express");
const app = express();
const connectDB = require("./config/dbConn");
const mongoose = require("mongoose");
const PORT = process.env.PORT || 5000;
const cors = require("cors");
const path = require("path");
const corsOptions = require("./config/corsOptions");
const cookieParser = require("cookie-parser");
const passport = require("passport"); // Import Passport
const passportSetup = require("./config/passport-setup"); // Import Passport configuration

// --- Route Imports ---
const rootRoutes = require("./routes/root");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const resetPasswordRoutes = require("./routes/resetPasswordRoutes");
const roadmapRoutes = require("./routes/roadmapRoutes");
const contactRoutes = require("./routes/contactRoutes");
const stageRoutes = require("./routes/stageRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const lessonRoutes = require("./routes/lessonRoutes");
const taskRoutes = require("./routes/tasksRoutes");
const submissionRoutes = require("./routes/submissionRoutes");
const notificationRoutes = require("./routes/notificationsRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const adminRoutes = require("./routes/adminRoutes");
const questionpoolRoutes = require("./routes/questionpoolRoutes");
const chatbotRoutes = require("./routes/chatbotRoutes");
// Connect to MongoDB
connectDB();

// --- Middleware ---

// Enable CORS
app.use(cors(corsOptions));

// Middleware for cookies
app.use(cookieParser());

// Enhanced body parser configuration - UPDATED
app.use(express.json({ limit: '10mb', extended: true }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Passport Middleware Initialization
app.use(passport.initialize());
// Call passport configuration function

// Serve static files from 'public' directory
app.use("/", express.static(path.join(__dirname, "public")));

// Serve uploaded files statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Set view engine
app.set("view engine", "ejs");

// Root and basic routes
app.use("/", rootRoutes);
app.use("/auth", authRoutes); // Includes Google OAuth routes now
app.use("/", resetPasswordRoutes);
app.use("/", contactRoutes);

// Core application routes
app.use("/users", userRoutes);
app.use("/roadmaps", roadmapRoutes);
app.use("/stages", stageRoutes);
app.use("/category", categoryRoutes);
app.use("/lesson", lessonRoutes);
app.use("/tasks", taskRoutes);
app.use("/submissions", submissionRoutes);
app.use("/notifications", notificationRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/admin", adminRoutes);
app.use("/question-pool", questionpoolRoutes);
app.use("/chatbot", chatbotRoutes);

// --- 404 Handler ---
app.all("*", (req, res) => {
  res.status(404);
  if (req.accepts("html")) {
    const viewPath = path.join(__dirname, "views", "404.html");
    require("fs").access(viewPath, (err) => {
      if (err) {
        res.type("txt").send("404 Not Found");
      } else {
        res.sendFile(viewPath);
      }
    });
  } else if (req.accepts("json")) {
    res.json({ message: "404 Not Found" });
  } else {
    res.type("txt").send("404 Not Found");
  }
});

// --- Server Startup ---
mongoose.connection.once("open", () => {
  console.log("Connected to MongoDB");
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});

mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err);
});
