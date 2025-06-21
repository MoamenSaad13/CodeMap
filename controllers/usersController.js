const User = require("../models/User");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const Roadmap = require("../models/Roadmap");
const Stage = require("../models/Stage");
const Tasks = require("../models/Tasks");
const Lesson = require("../models/Lesson");
const Notification = require("../models/Notification");
const Category = require("../models/Category");
const Submission = require("../models/Submission");
const Chatbot = require("../models/ChatSession");
const fs = require("fs");

// Define an array of protected emails. Add more emails to this array as needed.
const PROTECTED_EMAILS = ["moamensaad796@gmail.com" , "mariamali4119@gmail.com" , "rewanmohamed6510@gmail.com"]; 

// Multer storage configuration (can be shared)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = "uploads/profile-images/";
    fs.mkdirSync(uploadPath, { recursive: true }); // Ensure directory exists
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    let userIdForFilename = "unknown";
    if (req.params.id && mongoose.Types.ObjectId.isValid(req.params.id)) {
        userIdForFilename = req.user?.id || req.params.id;
    } else if (req.user?.id) {
        userIdForFilename = req.user.id;
    }
    cb(null, "profile_image-" + userIdForFilename + "-" + Date.now() + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};

const upload = multer({ storage: storage, fileFilter: fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

const getAllUsers = async (req, res) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Forbidden: Admin role required" });
  } console.log(req);
  try {
    const users = await User.find().select("-password").lean();
    if (!users?.length) {
      return res.status(404).json({ message: "No users found" });
    }
    res.json(users);
  } catch (error) {
    console.error("Error getting all users:", error);
    res.status(500).json({ message: "Server error getting users" });
  }
};

const addUser = async (req, res) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Forbidden: Admin role required" });
  }
  try {
    const { first_name, last_name, email, password, role } = req.body;
    if (!first_name || !last_name || !email || !password) {
      return res.status(400).json({ message: "First name, last_name, email, and password are required." });
    }
    const allowedRoles = User.schema.path("role").enumValues;
    if (role && !allowedRoles.includes(role)) {
      return res.status(400).json({ message: `Invalid role. Allowed values: ${allowedRoles.join(", ")}` });
    }
    const existingUser = await User.findOne({ email }).lean();
    if (existingUser) {
      return res.status(409).json({ message: "Email is already in use." });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      first_name,
      last_name,
      email,
      password: hashedPassword,
      role: role || "user",
    });
    await newUser.save();
    const userResponse = newUser.toObject();
    delete userResponse.password;
    return res.status(201).json({ message: "User created successfully.", user: userResponse });
  } catch (error) {
    console.error("Error adding user:", error);
    if (error.code === 11000) {
      return res.status(409).json({ message: "Email already exists." });
    }
    return res.status(500).json({ message: "Internal server error." });
  }
};

async function updatePassword(req, res) {
  const { currentPassword, newPassword, confirmNewPassword } = req.body;
  if (!currentPassword || !newPassword || !confirmNewPassword) {
    return res.status(400).json({ message: "All password fields are required." });
  }
  if (newPassword !== confirmNewPassword) {
    return res.status(400).json({ message: "New password and confirm password do not match." });
  }
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(newPassword)) {
    return res.status(400).json({
      message: "Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one digit, and one special character.",
    });
  }
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    if (user.googleId) {
        return res.status(403).json({ message: "Google-registered users cannot change password this way." });
    }
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect." });
    }
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();
    return res.status(200).json({ message: "Password updated successfully." });
  } catch (err) {
    console.error("Error in updatePassword:", err);
    return res.status(500).json({ message: "Internal server error." });
  }
}

// updateUserProfile handles multipart/form-data for text and optional image upload
// This is the version from pasted_content.txt with the OLD IMAGE DELETION LOGIC MODIFIED
const updateUserProfile = [
  upload.single("profileImage"), 
  async (req, res) => {
    const userIdFromParams = req.params.id;
    const requestingUserId = req.user?.id;
    const requestingUserRole = req.user?.role;
    const { first_name, last_name, email } = req.body; 
    let userIdToUpdate;
    let isAdminAction = false;

    if (userIdFromParams) {
      if (requestingUserRole !== "admin") {
        if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); 
        return res.status(403).json({ message: "Forbidden: Only admins can update users by ID." });
      }
      if (!mongoose.Types.ObjectId.isValid(userIdFromParams)) {
        if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({ message: "Invalid User ID in URL parameter." });
      }
      userIdToUpdate = userIdFromParams;
      isAdminAction = true;
    } else {
      if (!requestingUserId) {
        if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(401).json({ message: "Unauthorized" });
      }
      userIdToUpdate = requestingUserId;
    }

    try {
      const user = await User.findById(userIdToUpdate);
      if (!user) {
        if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(404).json({ message: "User not found" });
      }

      let requiresEmailVerification = false;
      let verificationCode = null;
      const originalEmail = user.email;
      let emailChangedByAdmin = false;
      const oldImagePath = user.profile_image; // Capture old image path before any updates

      if (email && email.trim() !== "" && email !== user.email) {
        if (!isAdminAction && user.googleId) {
          if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
          return res.status(403).json({ message: "Google-registered users cannot change their email address." });
        }
        const emailExists = await User.findOne({ email, _id: { $ne: userIdToUpdate } }).lean();
        if (emailExists) {
          if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
          return res.status(409).json({ message: "Email already in use by another account" });
        }
        if (isAdminAction) {
          console.log(`Admin (${requestingUserId}) is directly updating email for user ${userIdToUpdate} to ${email}`);
          user.email = email;
          user.pendingEmail = undefined;
          user.verificationCode = undefined;
          emailChangedByAdmin = true;
        } else {
          verificationCode = crypto.randomBytes(3).toString("hex");
          user.verificationCode = verificationCode;
          user.pendingEmail = email;
          requiresEmailVerification = true;
        }
      } else if (email === user.email) {
        user.pendingEmail = undefined;
        user.verificationCode = undefined;
      }

      if (first_name) user.first_name = first_name;
      if (last_name) user.last_name = last_name;

      let imageUpdated = false;
      if (req.file) {
        user.profile_image = req.file.path; 
        imageUpdated = true;
      }

      await user.save(); 

      // MODIFIED OLD IMAGE DELETION LOGIC:
      if (imageUpdated && oldImagePath && oldImagePath !== user.profile_image) {
        // Check if the oldImagePath is a URL (e.g., from Google). If so, don't try to unlink it from filesystem.
        if (!(oldImagePath.startsWith("http://") || oldImagePath.startsWith("https://"))) {
            if (fs.existsSync(oldImagePath)) {
                try {
                    fs.unlinkSync(oldImagePath);
                    console.log(`[updateUserProfile] Deleted old local profile image: ${oldImagePath}`);
                } catch (e) {
                    console.error("[updateUserProfile] Error deleting old local profile image:", e);
                }
            } else {
                 console.log(`[updateUserProfile] Old local profile image not found at path: ${oldImagePath}, skipping delete.`);
            }
        } else {
            console.log(`[updateUserProfile] Old profile image was a URL (${oldImagePath}), not deleting from filesystem.`);
        }
      }

      if (requiresEmailVerification) {
        try {
          const transporter = nodemailer.createTransport({
            service: "Gmail",
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
          });
          const mailOptions = {
            to: originalEmail, 
            from: process.env.EMAIL_USER,
            subject: "Verify Your Email Address Change Request",
            text: `Your verification code to confirm your email address change to ${user.pendingEmail} is: ${verificationCode}. If you did not request this, please ignore this email.`,
          };
          await transporter.sendMail(mailOptions);
          console.log(`Verification email for email change sent to ${originalEmail}`);
          let message = "Profile updated. Verification code sent to your current email address to confirm the change.";
          if (imageUpdated) message = "Profile and image updated. Verification code sent to your current email address.";
          return res.status(200).json({ message });

        } catch (emailError) {
          console.error("Error sending verification email:", emailError);
          user.pendingEmail = undefined; 
          user.verificationCode = undefined;
          await user.save(); 
          let message = "Profile updated, but failed to send verification email. Email change not processed.";
          if (imageUpdated) message = "Profile and image updated, but failed to send verification email. Email change not processed.";
          return res.status(500).json({ message });
        }
      }

      const updatedUserResponse = user.toObject();
      delete updatedUserResponse.password;
      delete updatedUserResponse.verificationCode;
      delete updatedUserResponse.pendingEmail;
      delete updatedUserResponse.deletionCode;
      delete updatedUserResponse.resetPasswordToken;
      delete updatedUserResponse.resetPasswordExpires;
      delete updatedUserResponse.googleId;

      let successMessage = "User profile updated successfully";
      if (imageUpdated && emailChangedByAdmin) {
        successMessage = "User profile, email, and image updated successfully";
      } else if (imageUpdated) {
        successMessage = "User profile and image updated successfully";
      } else if (emailChangedByAdmin) {
        successMessage = "User profile and email updated successfully";
      }
      
      return res.status(200).json({ message: successMessage, user: updatedUserResponse, filePath: imageUpdated ? user.profile_image : undefined });

    } catch (error) {
      console.error("Error updating user profile:", error);
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ message: "Server error updating profile" });
    }
  },
];

const verifyEmailCode = async (req, res) => {
  const userIdFromParams = req.params.id;
  const requestingUserId = req.user?.id;
  const requestingUserRole = req.user?.role;
  const { code } = req.body;
  let userIdToVerify;
  let isAdminAction = false;

  if (userIdFromParams) {
    if (requestingUserRole !== "admin") {
      return res.status(403).json({ message: "Forbidden: Only admins can verify email for other users by ID." });
    }
    if (!mongoose.Types.ObjectId.isValid(userIdFromParams)) {
      return res.status(400).json({ message: "Invalid User ID in URL parameter." });
    }
    userIdToVerify = userIdFromParams;
    isAdminAction = true;
  } else {
    if (!requestingUserId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    userIdToVerify = requestingUserId;
    if (!code) {
      return res.status(400).json({ message: "Verification code is required for self-verification." });
    }
  }

  try {
    const user = await User.findById(userIdToVerify);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.pendingEmail) {
        return res.status(400).json({ message: "No pending email change found for this user." });
    }

    let emailVerified = false;

    if (isAdminAction) {
        console.log(`Admin (${requestingUserId}) is forcing email verification for user ${userIdToVerify}`);
        emailVerified = true;
    } else {
        if (user.verificationCode && user.verificationCode === code) {
            emailVerified = true;
        } else {
            return res.status(400).json({ message: "Invalid or expired verification code." });
        }
    }

    if (emailVerified) {
      user.email = user.pendingEmail;
      user.pendingEmail = undefined;
      user.verificationCode = undefined;
      await user.save();
      return res.status(200).json({ message: "Email updated successfully" });
    }
    
    return res.status(400).json({ message: "Email verification failed." });

  } catch (error) {
    console.error("Error verifying email code:", error);
    res.status(500).json({ message: "Server error verifying email code" });
  }
};

const requestAccountDeletion = async (req, res) => {
  const requestingUserId = req.user?.id;
  if (!requestingUserId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const user = await User.findById(requestingUserId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (PROTECTED_EMAILS.includes(user.email)) {
        return res.status(403).json({ message: "This account cannot be deleted." });
    }
    const deletionCode = crypto.randomBytes(3).toString("hex");
    user.deletionCode = deletionCode;
    await user.save();
    try {
      const transporter = nodemailer.createTransport({
        service: "Gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });
      const mailOptions = {
        to: user.email,
        from: process.env.EMAIL_USER,
        subject: "Account Deletion Verification Code",
        text: `Your verification code to confirm account deletion is: ${deletionCode}. This code is required to permanently delete your account. If you did not request this, please ignore this email.`,
      };
      await transporter.sendMail(mailOptions);
      console.log(`Account deletion code sent to ${user.email}`);
      res.status(200).json({ message: "Verification code sent to your email" });
    } catch (emailError) {
      console.error("Error sending deletion code email:", emailError);
      res.status(500).json({ message: "Failed to send deletion code email. Please try again later or contact support." });
    }
  } catch (error) {
    console.error("Error requesting account deletion:", error);
    res.status(500).json({ message: "Server error requesting account deletion" });
  }
};

const deleteAccount = async (req, res) => {
  const userIdFromParams = req.params.id;
  const requestingUserId = req.user?.id;
  const requestingUserRole = req.user?.role;
  const { deletionCode } = req.body;
  let userIdToDelete;
  let isAdminAction = false;

  if (userIdFromParams) {
    if (requestingUserRole !== "admin") {
      return res.status(403).json({ message: "Forbidden: Only admins can delete users by ID." });
    }
    if (!mongoose.Types.ObjectId.isValid(userIdFromParams)) {
      return res.status(400).json({ message: "Invalid User ID in URL parameter." });
    }
    userIdToDelete = userIdFromParams;
    isAdminAction = true;
  } else {
    if (!requestingUserId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    userIdToDelete = requestingUserId;
    if (!deletionCode) {
      return res.status(400).json({ message: "Deletion code is required for self-deletion." });
    }
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await User.findById(userIdToDelete).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "User not found" });
    }

    if (PROTECTED_EMAILS.includes(user.email)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ message: "This account cannot be deleted." });
    }

    if (!isAdminAction) {
      if (!user.deletionCode || user.deletionCode !== deletionCode) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: "Invalid or expired deletion code" });
      }
    }
    
    const imagePath = user.profile_image;
    if (imagePath && !(imagePath.startsWith("http://") || imagePath.startsWith("https://"))) {
        if (fs.existsSync(imagePath)) {
            try {
                fs.unlinkSync(imagePath); 
                console.log(`Deleted profile image ${imagePath} for user ${userIdToDelete} during account deletion.`);
            } catch (e) {
                console.error(`Error deleting profile image ${imagePath} during account deletion:`, e);
            }
        }
    }

    await Roadmap.updateMany({ user: userIdToDelete }, { $pull: { user: userIdToDelete } }, { session });
    await Tasks.updateMany({ user: userIdToDelete }, { user:  null } , { session });
    await Stage.updateMany({ user: userIdToDelete }, { $pull: { user: userIdToDelete } }, { session });
    await Category.updateMany({ user: userIdToDelete }, { $pull: { user: userIdToDelete } }, { session });
    await Lesson.updateMany({ user: userIdToDelete }, { $pull: { user: userIdToDelete } }, { session });
    await Notification.deleteMany({ user: userIdToDelete }, { session });
    await Chatbot.deleteMany({ user: userIdToDelete }, { session });
    await User.deleteOne({ _id: userIdToDelete }, { session });

    await session.commitTransaction();
    session.endSession();
    res.status(200).json({ message: "Account deleted successfully" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error deleting account:", error);
    res.status(500).json({ message: "Server error deleting account", error: error.message });
  }
};

const calculatePercentage = (completed, total) => {
  if (total === 0) {
    return 0;
  }
  const validCompleted = Math.min(completed, total);
  return Math.round((validCompleted / total) * 100);
};

const getUserProgressDetails = async (req, res) => {
  const { userId: userIdFromParams } = req.params;
  const requestingUserId = req.user?.id;
  const requestingUserRole = req.user?.role;
  let userIdToQuery;
  if (requestingUserRole === "admin" && userIdFromParams) {
    if (!mongoose.Types.ObjectId.isValid(userIdFromParams)) {
      return res.status(400).json({ message: "Invalid User ID provided by admin." });
    }
    userIdToQuery = userIdFromParams;
  } else if (requestingUserRole === "user" && !userIdFromParams) {
    userIdToQuery = requestingUserId;
  } else {
    return res.status(403).json({ message: "Forbidden: Invalid request parameters for your role or not authenticated." });
  }
  try {
    const user = await User.findById(userIdToQuery).select("roadmap completedlesson").lean();
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    const enrolledRoadmapIds = user.roadmap || [];
    const completedLessonIds = new Set((user.completedlesson || []).map(id => id.toString()));
    if (enrolledRoadmapIds.length === 0) {
      return res.json({ message: "User is not enrolled in any roadmaps.", progress: [] });
    }
    const [roadmaps, stages, lessons] = await Promise.all([
      Roadmap.find({ _id: { $in: enrolledRoadmapIds } }).select("title").lean(),
      Stage.find({ roadmap: { $in: enrolledRoadmapIds } }).select("title roadmap").lean(),
      Lesson.find({ roadmap: { $in: enrolledRoadmapIds } }).select("stage roadmap").lean(),
    ]);
    const progressResults = roadmaps.map(roadmap => {
      const roadmapIdString = roadmap._id.toString();
      const lessonsInRoadmap = lessons.filter(l => l.roadmap.toString() === roadmapIdString);
      const stagesInRoadmap = stages.filter(s => s.roadmap.toString() === roadmapIdString);
      const totalLessonsInRoadmap = lessonsInRoadmap.length;
      const completedLessonsInRoadmap = lessonsInRoadmap.filter(l => completedLessonIds.has(l._id.toString())).length;
      const roadmapProgressPercentage = calculatePercentage(completedLessonsInRoadmap, totalLessonsInRoadmap);
      const stageProgress = stagesInRoadmap.map(stage => {
        const stageIdString = stage._id.toString();
        const lessonsInStage = lessonsInRoadmap.filter(l => l.stage.toString() === stageIdString);
        const totalLessonsInStage = lessonsInStage.length;
        const completedLessonsInStage = lessonsInStage.filter(l => completedLessonIds.has(l._id.toString())).length;
        const stageProgressPercentage = calculatePercentage(completedLessonsInStage, totalLessonsInStage);
        return {
          stageId: stage._id,
          stageTitle: stage.title,
          completedLessons: completedLessonsInStage,
          totalLessons: totalLessonsInStage,
          progressPercentage: stageProgressPercentage,
          progressString: `${stage.title} = ${stageProgressPercentage}%`,
        };
      });
      return {
        roadmapId: roadmap._id,
        roadmapTitle: roadmap.title,
        overallCompletedLessons: completedLessonsInRoadmap,
        overallTotalLessons: totalLessonsInRoadmap,
        overallProgressPercentage: roadmapProgressPercentage,
        progressString: `${roadmap.title} = ${roadmapProgressPercentage}%`,
        stages: stageProgress,
      };
    });
    res.json({ progress: progressResults });
  } catch (error) {
    console.error("Error getting user progress details:", error);
    res.status(500).json({ message: "Server error getting user progress details", error: error.message });
  }
};

const enrollUserInRoadmap = async (req, res) => {
  const { roadmapId, userId: userIdFromParams } = req.params;
  const requestingUserId = req.user?.id;
  const requestingUserRole = req.user?.role;
  let userIdToEnroll;
  if (requestingUserRole === "admin" && userIdFromParams) {
    if (!mongoose.Types.ObjectId.isValid(userIdFromParams)) {
      return res.status(400).json({ message: "Invalid User ID provided by admin." });
    }
    userIdToEnroll = userIdFromParams;
    console.log(`Admin (${requestingUserId}) attempting to enroll user ${userIdToEnroll} in roadmap ${roadmapId}`);
  } else if (requestingUserRole === "user" && !userIdFromParams) {
    userIdToEnroll = requestingUserId;
    console.log(`User (${userIdToEnroll}) attempting to self-enroll in roadmap ${roadmapId}`);
  } else {
    return res.status(403).json({ message: "Forbidden: Invalid request parameters for your role." });
  }
  if (!mongoose.Types.ObjectId.isValid(roadmapId)) {
    return res.status(400).json({ message: "Invalid Roadmap ID." });
  }
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const user = await User.findById(userIdToEnroll).session(session);
    const roadmap = await Roadmap.findById(roadmapId).populate("category").session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "User to enroll not found." });
    }
    if (!roadmap) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Roadmap not found." });
    }
    const isAlreadyEnrolled = await User.exists({ _id: userIdToEnroll, roadmap: roadmapId }).session(session);
    if (isAlreadyEnrolled) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "User is already enrolled in this roadmap." });
    }
    const lessonIds = await Lesson.find({ roadmap: roadmapId }, "_id").session(session).lean();
    const lessonObjectIds = lessonIds.map(l => l._id);
    const roadmapCategoryIds = roadmap.category.map(c => c._id);
    const taskIds = await Tasks.find({ category: { $in: roadmapCategoryIds } }, "_id").session(session).lean();
    const taskObjectIds = taskIds.map(t => t._id);
    const stageIds = await Stage.find({ roadmap: roadmapId }, "_id").session(session).lean();
    const stageObjectIds = stageIds.map(l => l._id);
    const categoryIds = await Category.find({ roadmap: roadmapId }, "_id").session(session).lean();
    const categoryObjectIds = categoryIds.map(l => l._id);
    await User.updateOne(
      { _id: userIdToEnroll },
      {
        $addToSet: {
          roadmap: roadmapId,
          lesson: { $each: lessonObjectIds },
          // task: { $each: taskObjectIds },
          stage: { $each: stageObjectIds },
          category:{$each:categoryObjectIds},
        },
      },
      { session }
    );
    await Roadmap.updateOne({ _id: roadmapId }, { $addToSet: { user: userIdToEnroll } }, { session });
    if (lessonObjectIds.length > 0) {
      await Lesson.updateMany({ _id: { $in: lessonObjectIds } }, { $addToSet: { user: userIdToEnroll } }, { session });
    }
    // if (taskObjectIds.length > 0) {
    //   await Tasks.updateMany({ _id: { $in: taskObjectIds } }, { $set: { user: userIdToEnroll } }, { session });
    // }
    if (stageObjectIds.length > 0) {
      await Stage.updateMany({ _id: { $in: stageObjectIds } }, { $addToSet: { user: userIdToEnroll } }, { session });
    }
    if (categoryObjectIds.length > 0) {
      await Category.updateMany({ _id: { $in: categoryObjectIds } }, { $addToSet: { user: userIdToEnroll } }, { session });
    }
    await session.commitTransaction();
    session.endSession();
    res.status(200).json({ message: "User enrolled in roadmap successfully, and associated items linked." });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error enrolling user in roadmap:", error);
    res.status(500).json({ message: "Error enrolling user in roadmap", error: error.message });
  }
};

const setUserRole = async (req, res) => {
  const userIdToUpdate = req.params.id;
  const { role } = req.body;
  if (!mongoose.Types.ObjectId.isValid(userIdToUpdate)) {
    return res.status(400).json({ message: "Invalid User ID" });
  }
  const allowedRoles = User.schema.path("role").enumValues;
  if (!role || !allowedRoles.includes(role)) {
    return res.status(400).json({ message: `Invalid role. Allowed values: ${allowedRoles.join(", ")}` });
  }
  if (req.user.id === userIdToUpdate) {
    return res.status(400).json({ message: "Admins cannot change their own role via this endpoint." });
  }
  try {
    const userToUpdateDoc = await User.findById(userIdToUpdate).exec();
    if (!userToUpdateDoc) {
      return res.status(404).json({ message: "User not found" });
    }
    userToUpdateDoc.role = role;
    await userToUpdateDoc.save();
    res.json({
      message: `User ${userToUpdateDoc.first_name} ${userToUpdateDoc.last_name}\\'s role updated to ${role}`,
    });
  } catch (error) {
    console.error("Error setting user role:", error);
    res.status(500).json({ message: "Server error setting user role" });
  }
};

/**
 * Unenroll a user from a roadmap and remove them from associated categories, stages, lessons, and tasks.
 * Also deletes all tasks and submissions related to the roadmap categories.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} - JSON response
 */
const unenrollUserFromRoadmap = async (req, res) => {
  const { roadmapId, userId: userIdFromParams } = req.params;
  const requestingUserId = req.user?.id;
  const requestingUserRole = req.user?.role;
  let userIdToUnenroll;
  
  // Determine which user to unenroll based on role and parameters
  if (requestingUserRole === "admin" && userIdFromParams) {
    if (!mongoose.Types.ObjectId.isValid(userIdFromParams)) {
      return res.status(400).json({ message: "Invalid User ID provided by admin." });
    }
    userIdToUnenroll = userIdFromParams;
    console.log(`Admin (${requestingUserId}) attempting to unenroll user ${userIdToUnenroll} from roadmap ${roadmapId}`);
  } else if (requestingUserRole === "user" && !userIdFromParams) {
    userIdToUnenroll = requestingUserId;
    console.log(`User (${userIdToUnenroll}) attempting to self-unenroll from roadmap ${roadmapId}`);
  } else {
    return res.status(403).json({ message: "Forbidden: Invalid request parameters for your role." });
  }
  
  if (!mongoose.Types.ObjectId.isValid(roadmapId)) {
    return res.status(400).json({ message: "Invalid Roadmap ID." });
  }
  
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Find the user to unenroll
    const user = await User.findById(userIdToUnenroll).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "User to unenroll not found." });
    }
    
    // Check if user is enrolled in this roadmap
    const isEnrolled = user.roadmap.some(id => id.toString() === roadmapId);
    if (!isEnrolled) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "User is not enrolled in this roadmap." });
    }
    
    // Find the roadmap
    const roadmap = await Roadmap.findById(roadmapId).session(session);
    if (!roadmap) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Roadmap not found." });
    }
    
    // Get all categories associated with this roadmap
    const categoriesResult = await mongoose.model("Category")
      .find({ roadmap: roadmapId }, "_id")
      .session(session)
      .lean();
    const categoryIdsToRemove = categoriesResult.map(c => c._id);
    
    // Get all stages, lessons, and tasks to remove
    const [stageIdsResult, lessonIdsResult, taskIdsResult] = await Promise.all([
      Stage.find({ roadmap: roadmapId }, "_id").session(session).lean(),
      Lesson.find({ roadmap: roadmapId }, "_id").session(session).lean(),
      Tasks.find({ 
        category: { $in: categoryIdsToRemove },
        user: userIdToUnenroll
      }, "_id").session(session).lean(),
    ]);
    
    const stageIdsToRemove = stageIdsResult.map(s => s._id);
    const lessonIdsToRemove = lessonIdsResult.map(l => l._id);
    const taskIdsToRemove = taskIdsResult.map(t => t._id);
    
    // 1. Delete all submissions related to these tasks
    if (taskIdsToRemove.length > 0) {
      const submissionDeleteResult = await Submission.deleteMany({ 
        task: { $in: taskIdsToRemove },
        user: userIdToUnenroll
      }).session(session);
      
      console.log(`Deleted ${submissionDeleteResult.deletedCount} submissions for user ${userIdToUnenroll}`);
    }
    
    // 2. Delete the tasks themselves (not just remove references)
    if (taskIdsToRemove.length > 0) {
      const taskDeleteResult = await Tasks.deleteMany({ 
        _id: { $in: taskIdsToRemove },
        user: userIdToUnenroll
      }).session(session);
      
      console.log(`Deleted ${taskDeleteResult.deletedCount} tasks for user ${userIdToUnenroll}`);
    }
    
    // 3. Update user document to remove roadmap, stages, lessons, tasks, and categories
    await User.updateOne(
      { _id: userIdToUnenroll },
      {
        $pull: {
          roadmap: roadmapId,
          stage: { $in: stageIdsToRemove },
          lesson: { $in: lessonIdsToRemove },
          completedlesson: { $in: lessonIdsToRemove },
          task: { $in: taskIdsToRemove },
          category: { $in: categoryIdsToRemove }
        },
      },
      { session }
    );
    
    // 4. Update roadmap to remove user
    await Roadmap.updateOne(
      { _id: roadmapId }, 
      { $pull: { user: userIdToUnenroll } }, 
      { session }
    );
    
    // 5. Update stages to remove user
    if (stageIdsToRemove.length > 0) {
      await Stage.updateMany(
        { _id: { $in: stageIdsToRemove } }, 
        { $pull: { user: userIdToUnenroll } }, 
        { session }
      );
    }
    
    // 6. Update lessons to remove user
    if (lessonIdsToRemove.length > 0) {
      await Lesson.updateMany(
        { _id: { $in: lessonIdsToRemove } }, 
        { $pull: { user: userIdToUnenroll, completedby: userIdToUnenroll } }, 
        { session }
      );
    }
    
    // 7. Update categories to remove user and task references
    if (categoryIdsToRemove.length > 0) {
      await mongoose.model("Category").updateMany(
        { _id: { $in: categoryIdsToRemove } },
        { 
          $pull: { 
            user: userIdToUnenroll,
            task: { $in: taskIdsToRemove } // Remove task references from categories
          } 
        },
        { session }
      );
    }
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(200).json({ 
      message: "User unenrolled from roadmap successfully. All related tasks and submissions have been deleted.",
      tasksDeleted: taskIdsToRemove.length
    });
    
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error unenrolling user from roadmap:", error);
    res.status(500).json({ 
      message: "Server error unenrolling user from roadmap", 
      error: error.message 
    });
  }
};

const getUserById = async (req, res) => {
  const userIdFromParams = req.params.id;
  const requestingUserId = req.user?.id;
  const requestingUserRole = req.user?.role;
  if (!mongoose.Types.ObjectId.isValid(userIdFromParams)) {
    return res.status(400).json({ message: "Invalid User ID format" });
  }
  if (requestingUserRole !== "admin" && requestingUserId !== userIdFromParams) {
    return res.status(403).json({ message: "Forbidden: You do not have permission to access this user\\\\\\\"s details." });
  }
  try {
const user = await User.findById(userIdFromParams)
  .select("-password -verificationCode -pendingEmail -deletionCode -resetPasswordToken -resetPasswordExpires")
  .populate({
    path: "roadmaps",
    select: "title",
    populate: {
      path: "stages",
      select: "title",
      populate: {
        path: "categories",
        select: "title",
        populate: {
          path: "lessons",
          select: "title",
          populate: {
            path: "tasks",
            select: "title"
          }
        }
      }
    }
  })
  .lean();
      if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (error) {
    console.error(`Error getting user by ID ${userIdFromParams}:`, error);
    res.status(500).json({ message: "Server error getting user details" });
  }
};

const deleteProfileImage = async (req, res) => {
  const userIdFromParams = req.params.id;
  const requestingUserId = req.user?.id;
  const requestingUserRole = req.user?.role;
  let userIdToDeleteImageFor;

  if (userIdFromParams) {
    if (requestingUserRole !== "admin") {
      return res.status(403).json({ message: "Forbidden: Only admins can delete images for other users by ID." });
    }
    if (!mongoose.Types.ObjectId.isValid(userIdFromParams)) {
      return res.status(400).json({ message: "Invalid User ID in URL parameter." });
    }
    userIdToDeleteImageFor = userIdFromParams;
  } else {
    if (!requestingUserId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    userIdToDeleteImageFor = requestingUserId;
  }

  try {
    const user = await User.findById(userIdToDeleteImageFor);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const imagePath = user.profile_image;
    if (!imagePath) {
      return res.status(400).json({ message: "No profile image to delete." });
    }

    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
      console.log(`Deleted profile image: ${imagePath} for user ${userIdToDeleteImageFor}`);
    } else {
      console.warn(`Profile image path not found on filesystem: ${imagePath} for user ${userIdToDeleteImageFor}. Proceeding to clear DB reference.`);
    }

    user.profile_image = undefined;
    await user.save();

    res.status(200).json({ message: "Profile image deleted successfully." });

  } catch (error) {
    console.error(`Error deleting profile image for user ${userIdToDeleteImageFor}:`, error);
    res.status(500).json({ message: "Server error deleting profile image" });
  }
};

// getProfileImageFile with ENHANCED LOGIC as requested by user
const getProfileImageFile = async (req, res) => {
  let userIdToQuery;
  const userIdFromParams = req.params.userId; 
  const requestingUserId = req.user?.id;
  const requestingUserRole = req.user?.role;

  console.log(`[getProfileImageFile] Received request. Params UserID: ${userIdFromParams}, Auth UserID: ${requestingUserId}, Auth Role: ${requestingUserRole}`);

  if (userIdFromParams) {
    if (!mongoose.Types.ObjectId.isValid(userIdFromParams)) {
      console.log("[getProfileImageFile] Invalid User ID format in URL parameter.");
      return res.status(400).json({ message: "Invalid User ID format in URL" });
    }
    if (requestingUserRole !== "admin" && requestingUserId !== userIdFromParams) {
        console.log(`[getProfileImageFile] Forbidden access for user ${requestingUserId} to image of ${userIdFromParams}.`);
        return res.status(403).json({ message: "Forbidden to access this user's image." });
    }
    userIdToQuery = userIdFromParams;
  } else {
    if (!requestingUserId) {
      console.log("[getProfileImageFile] Unauthorized access, no authenticated user.");
      return res.status(401).json({ message: "Unauthorized" });
    }
    userIdToQuery = requestingUserId;
  }
  console.log(`[getProfileImageFile] Determined userIdToQuery: ${userIdToQuery}`);

  try {
    const user = await User.findById(userIdToQuery).select("profile_image googleId googleProfilePicture").lean();
    if (!user) {
      console.log(`[getProfileImageFile] User not found for ID: ${userIdToQuery}`);
      return res.status(404).json({ message: "User not found." });
    }
    console.log(`[getProfileImageFile] User found: ${JSON.stringify(user)}`);

    // Prioritize locally uploaded image
    if (user.profile_image) {
        const imagePath = user.profile_image;
        console.log(`[getProfileImageFile] Local profile_image path found: ${imagePath}`);
        if (!fs.existsSync(imagePath)) {
            console.error(`[getProfileImageFile] Local profile image file NOT FOUND at path: ${imagePath} for user ${userIdToQuery}`);
            // Fallback for Google users if local image is missing but googleProfilePicture exists
            if (user.googleId && user.googleProfilePicture) {
                console.log(`[getProfileImageFile] Local image missing for Google user ${userIdToQuery}. Attempting to redirect to Google profile picture: ${user.googleProfilePicture}`);
                return res.redirect(user.googleProfilePicture);
            }
            return res.status(404).json({ message: "Profile image file not found on server." });
        }
        console.log(`[getProfileImageFile] Serving local image file: ${imagePath}`);
        return res.sendFile(path.resolve(imagePath)); // Use path.resolve for safety
    } else if (user.googleId && user.googleProfilePicture) {
        // If no local image, but user is Google user and has googleProfilePicture URL
        console.log(`[getProfileImageFile] No local image for Google user ${userIdToQuery}. Redirecting to Google profile picture: ${user.googleProfilePicture}`);
        return res.redirect(user.googleProfilePicture);
    } else {
        console.log(`[getProfileImageFile] No local image and no Google profile picture URL for user ${userIdToQuery}.`);
    }

    // If neither local image nor Google image URL exists
    return res.status(404).json({ message: "Profile image not found for this user." });

  } catch (error) {
    console.error(`[getProfileImageFile] Server error for user ${userIdToQuery}:`, error);
    res.status(500).json({ message: "Server error retrieving profile image" });
  }
};
/**
 * Get user registrations grouped by month for a specified year
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with monthly registration counts
 */
const getUserRegistrationsByMonth = async (req, res) => {
  // Check if user has admin role
  if (req.user?.role !== "admin") {
    return res.status(403).json({ 
      success: false,
      message: "Forbidden: Admin role required to access registration statistics" 
    });
  }

  try {
    // Get year from query parameter, default to current year if not provided
    const year = parseInt(req.query.year) || new Date().getFullYear();
    
    // Create date range for the specified year
    const startDate = new Date(`${year}-01-01T00:00:00.000Z`);
    const endDate = new Date(`${year+1}-01-01T00:00:00.000Z`);
    
    // MongoDB aggregation pipeline
    const result = await User.aggregate([
      // Stage 1: Filter documents by creation date within the specified year
      {
        $match: {
          createdAt: {
            $gte: startDate,
            $lt: endDate
          }
        }
      },
      // Stage 2: Group documents by month and count
      {
        $group: {
          _id: { $month: "$createdAt" },
          count: { $sum: 1 },
          // Optional: collect user IDs for debugging
          userIds: { $push: "$_id" }
        }
      },
      // Stage 3: Project the final shape of the documents
      {
        $project: {
          _id: 0,
          month: "$_id",
          count: 1,
          // Include userIds only in development environment
          ...(process.env.NODE_ENV === "development" ? { userIds: 1 } : {})
        }
      },
      // Stage 4: Sort by month
      {
        $sort: { month: 1 }
      }
    ]);

    // Create an array with all months (1-12) initialized to zero counts
    const monthlyData = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      monthName: new Date(year, i, 1).toLocaleString('default', { month: 'long' }),
      count: 0
    }));

    // Fill in the actual counts from the aggregation result
    result.forEach(item => {
      const monthIndex = item.month - 1;
      monthlyData[monthIndex].count = item.count;
      
      // Include userIds in development environment
      if (process.env.NODE_ENV === "development" && item.userIds) {
        monthlyData[monthIndex].userIds = item.userIds;
      }
    });

    // Calculate total registrations for the year
    const totalRegistrations = monthlyData.reduce((sum, month) => sum + month.count, 0);

    // Return the response
    return res.status(200).json({
      success: true,
      data: {
        year,
        totalRegistrations,
        monthlyData
      }
    });
  } catch (error) {
    console.error("Error in getUserRegistrationsByMonth:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve user registration statistics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

module.exports = {
  getAllUsers,
  addUser,
  updatePassword,
  updateUserProfile,
  verifyEmailCode,
  requestAccountDeletion,
  deleteAccount,
  enrollUserInRoadmap,
  setUserRole,
  getUserProgressDetails,
  unenrollUserFromRoadmap,
  getUserById,
  deleteProfileImage,
  getProfileImageFile,
  getUserRegistrationsByMonth,
};
