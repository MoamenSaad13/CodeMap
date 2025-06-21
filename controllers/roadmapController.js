const multer = require("multer");
const path = require("path");
const mongoose = require("mongoose");
const fs = require("fs");
const Stage = require("../models/Stage");
const Lesson = require("../models/Lesson");
const Category = require("../models/Category");
const Roadmap = require("../models/Roadmap");
const User = require("../models/User");
const Tasks = require("../models/Tasks");
const NotificationService = require("../services/notificationService"); // Import NotificationService

// Get all roadmaps
const getAllRoadmaps = async (req, res) => {
  try {
    const roadmaps = await Roadmap.find()
      .populate("stage", "title")
      .populate("category", "title")
      .populate("lesson", "title");
      const roadmapsWithUserCount = roadmaps.map(roadmap => ({
      ...roadmap.toObject(),
      userCount: roadmap.user.length,
    }))
    res.status(200).json(roadmapsWithUserCount);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create a new roadmap
const createRoadmap = async (req, res) => {
  try {
    const roadmap = new Roadmap(req.body);
    await roadmap.save();
    res.status(201).json({ message: "Roadmap created successfully" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get a specific roadmap
const getRoadmapById = async (req, res) => {
  try {
    const roadmap = await Roadmap.findById(req.params.id)
      .populate("stage", "title")
      .populate("category", "title")
      .populate("lesson", "title");
       const roadmapWithUserCount = {
      ...roadmap.toObject(),
      userCount: roadmap.user.length,
    };
    if (!roadmap) return res.status(404).json({ message: "Roadmap not found" });
    res.status(200).json(roadmapWithUserCount);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update a roadmap
const updateRoadmap = async (req, res) => {
  try {
    const roadmap = await Roadmap.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!roadmap) return res.status(404).json({ message: "Roadmap not found" });
    res.status(200).json({ message: "Roadmap updated successfully" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

//DeleteRoadmap function
const deleteRoadmap = async (req, res) => {
  const roadmapId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(roadmapId)) {
    return res.status(400).json({ message: "Invalid Roadmap ID." });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Find the roadmap to ensure it exists and get its image path
    const roadmap = await Roadmap.findById(roadmapId).session(session);
    if (!roadmap) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Roadmap not found." });
    }
    const imagePath = roadmap.image; // Get image path before deleting

    // 2. Find all associated Stages, Lessons, Categories, and Tasks (Corrected Syntax)
    const stageIdsToRemove = (await Stage.find({ roadmap: roadmapId }, "_id").session(session).lean()).map(d => d._id);
    const lessonIdsToRemove = (await Lesson.find({ roadmap: roadmapId }, "_id").session(session).lean()).map(d => d._id);
    const categoryIdsToRemove = (await Category.find({ roadmap: roadmapId }, "_id").session(session).lean()).map(d => d._id);
    // Assuming Tasks are linked via Category
    const taskIdsToRemove = (await Tasks.find({ category: { $in: categoryIdsToRemove } }, "_id").session(session).lean()).map(d => d._id);

    // 3. Find all users enrolled in this roadmap (Corrected Syntax)
    const userIdsToUpdate = (await User.find({ roadmap: roadmapId }, "_id").session(session).lean()).map(d => d._id);

    // 4. Update all enrolled users to remove references
    if (userIdsToUpdate.length > 0) {
      await User.updateMany(
        { _id: { $in: userIdsToUpdate } },
        {
          $pull: {
            roadmap: roadmapId,
            stage: { $in: stageIdsToRemove },
            lesson: { $in: lessonIdsToRemove },
            completedlesson: { $in: lessonIdsToRemove }, // Also remove from completed lessons
            task: { $in: taskIdsToRemove },
            category: { $in: categoryIdsToRemove } // Assuming users have category references
          },
        },
        { session }
      );
      console.log(`Updated ${userIdsToUpdate.length} users, removing references to roadmap ${roadmapId}`);
    }

    // 5. Delete related Tasks, Lessons, Categories, and Stages
    if (taskIdsToRemove.length > 0) {
      await Tasks.deleteMany({ _id: { $in: taskIdsToRemove } }, { session });
      console.log(`Deleted ${taskIdsToRemove.length} tasks related to roadmap ${roadmapId}`);
    }
    if (lessonIdsToRemove.length > 0) {
      await Lesson.deleteMany({ _id: { $in: lessonIdsToRemove } }, { session });
      console.log(`Deleted ${lessonIdsToRemove.length} lessons related to roadmap ${roadmapId}`);
    }
    if (categoryIdsToRemove.length > 0) {
      await Category.deleteMany({ _id: { $in: categoryIdsToRemove } }, { session });
      console.log(`Deleted ${categoryIdsToRemove.length} categories related to roadmap ${roadmapId}`);
    }
    if (stageIdsToRemove.length > 0) {
      await Stage.deleteMany({ _id: { $in: stageIdsToRemove } }, { session });
      console.log(`Deleted ${stageIdsToRemove.length} stages related to roadmap ${roadmapId}`);
    }

    // 6. Delete the Roadmap itself
    await Roadmap.deleteOne({ _id: roadmapId }, { session });
    console.log(`Deleted roadmap ${roadmapId}`);

    // 7. Commit the transaction
    await session.commitTransaction();
    session.endSession();

    // 8. Delete the roadmap image file (outside the transaction)
    if (imagePath) {
      const imagePathOnServer = path.join(__dirname, "..", imagePath);
      if (fs.existsSync(imagePathOnServer)) {
        fs.unlink(imagePathOnServer, (unlinkErr) => {
          if (unlinkErr) {
            console.error(`Failed to delete roadmap image file ${imagePathOnServer}:`, unlinkErr);
            // Don't fail the request, just log the error
          } else {
            console.log(`Deleted roadmap image file ${imagePathOnServer}`);
          }
        });
      }
    }

    res.status(200).json({
      message:
        "Roadmap and all related data (including user references) deleted successfully.",
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error deleting roadmap:", error);
    res
      .status(500)
      .json({ message: "Internal server error during roadmap deletion", error: error.message });
  }
};

// --- New function for user enrollment in a roadmap ---
const enrollUserInRoadmap = async (req, res) => {
  const { roadmapId } = req.params;
  const userId = req.user.id; // Assuming user ID is available from authentication middleware

  if (!mongoose.Types.ObjectId.isValid(roadmapId)) {
    return res.status(400).json({ message: "Invalid Roadmap ID." });
  }

  try {
    const roadmap = await Roadmap.findById(roadmapId);
    const user = await User.findById(userId);

    if (!roadmap) {
      return res.status(404).json({ message: "Roadmap not found." });
    }
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Check if user is already enrolled
    if (roadmap.user.includes(userId)) {
      return res.status(409).json({ message: "User already enrolled in this roadmap." });
    }

    // Add user to roadmap's user array
    roadmap.user.push(userId);
    await roadmap.save();

    // Add roadmap to user's roadmap array
    user.roadmap.push(roadmapId);
    await user.save();

    // --- Notification: Student Enrolling in Roadmap ---
    try {
      await NotificationService.createNotification({
        type: "enrollment",
        title: "Successfully Enrolled in Roadmap",
        message: `Congratulations ${user.first_name}! You have been successfully enrolled in "${roadmap.title}". Start your learning journey by exploring the stages and lessons.`,
        assignedTo: userId,
        relatedRoadmap: roadmapId,
        actions: [
          {
            label: "Start Learning",
            action: "view",
            url: `/roadmaps/${roadmapId}`,
            style: "primary",
          },
          {
            label: "View All Roadmaps",
            action: "view",
            url: "/roadmaps",
            style: "secondary",
          },
        ],
        metadata: {
          enrollmentDate: new Date(),
          roadmapTitle: roadmap.title,
          targetAudience: roadmap.target_audience
        }
      });
      console.log(`Enrollment notification sent to user: ${user.email} for roadmap: ${roadmap.title}`);
    } catch (notificationError) {
      console.error("Error sending enrollment notification:", notificationError);
    }
    // --- End Notification ---

    res.status(200).json({ message: "Successfully enrolled in roadmap." });

  } catch (error) {
    console.error("Error enrolling user in roadmap:", error);
    res.status(500).json({ message: "Internal server error during enrollment.", error: error.message });
  }
};

const uploadDir = path.join(__dirname, "../uploads/roadmap-images");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `roadmap-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png/;
    const okExt = allowed.test(path.extname(file.originalname).toLowerCase());
    const okMime = allowed.test(file.mimetype);
    if (okExt && okMime) return cb(null, true);
    cb(new Error("Only JPEG/PNG images are allowed"));
  },
}).single("image");

const uploadRoadmapImage = (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ message: "No image file uploaded" });
    }

    const roadmapId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(roadmapId)) {
      // If an image was uploaded but ID is invalid, delete the uploaded file
      fs.unlink(req.file.path, (unlinkErr) => {
          if (unlinkErr) console.error("Failed to delete orphaned upload:", unlinkErr);
      });
      return res.status(400).json({ message: "Invalid Roadmap ID" });
    }

    try {
      const roadmap = await Roadmap.findById(roadmapId);
      if (!roadmap) {
        // If roadmap not found, delete the uploaded file
        fs.unlink(req.file.path, (unlinkErr) => {
            if (unlinkErr) console.error("Failed to delete orphaned upload:", unlinkErr);
        });
        return res.status(404).json({ message: "Roadmap not found" });
      }

      // If there was an old image, delete it from the filesystem
      if (roadmap.image) {
        const oldImagePathOnServer = path.join(__dirname, "..", roadmap.image);
        if (fs.existsSync(oldImagePathOnServer)) {
          fs.unlink(oldImagePathOnServer, (unlinkErr) => {
            if (unlinkErr) {
              console.error("Failed to delete old roadmap image:", unlinkErr);
            }
          });
        }
      }

      // Store relative path for web access
      roadmap.image = `/uploads/roadmap-images/${req.file.filename}`;
      await roadmap.save();

      res.status(200).json({
        message: "Roadmap image uploaded and saved successfully",
        image: roadmap.image,
      });
    } catch (saveErr) {
      // If DB save fails, attempt to delete the newly uploaded file
      fs.unlink(req.file.path, (unlinkErr) => {
          if (unlinkErr) console.error("Failed to delete upload after DB error:", unlinkErr);
      });
      res.status(500).json({ message: saveErr.message });
    }
  });
};

const getRoadmapImageFileById = async (req, res) => {
  try {
    const roadmapId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(roadmapId)) {
      return res.status(400).json({ message: "Invalid Roadmap ID." });
    }

    const roadmap = await Roadmap.findById(roadmapId).select("image").lean();
    if (!roadmap) {
      return res.status(404).json({ message: "Roadmap not found." });
    }

    if (!roadmap.image) {
      return res.status(404).json({ message: "Roadmap does not have an image." });
    }

    const imagePathOnServer = path.join(__dirname, "..", roadmap.image);

    if (fs.existsSync(imagePathOnServer)) {
      res.sendFile(imagePathOnServer);
    } else {
      console.error(`Image file not found at: ${imagePathOnServer} for roadmap ${roadmapId}`);
      return res.status(404).json({ message: "Image file not found on server." });
    }
  } catch (error) {
    console.error("Error getting roadmap image file:", error);
    res.status(500).json({ message: "Server error while retrieving image file." });
  }
};

// Controller function to delete a roadmap image
const deleteRoadmapImage = async (req, res) => {
  try {
    const roadmapId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(roadmapId)) {
      return res.status(400).json({ message: "Invalid Roadmap ID." });
    }

    const roadmap = await Roadmap.findById(roadmapId);
    if (!roadmap) {
      return res.status(404).json({ message: "Roadmap not found." });
    }

    if (!roadmap.image) {
      return res.status(400).json({ message: "Roadmap does not have an image to delete." });
    }

    const imagePathOnServer = path.join(__dirname, "..", roadmap.image);

    // Delete the image file from the server
    if (fs.existsSync(imagePathOnServer)) {
      fs.unlink(imagePathOnServer, async (err) => {
        if (err) {
          console.error("Error deleting image file:", err);
          // Even if file deletion fails, proceed to clear DB record, but inform client
          roadmap.image = null;
          await roadmap.save();
          return res.status(500).json({
            message: "Error deleting image file from server, but image reference removed from database.",
            dbCleared: true
          });
        }

        // If file deletion is successful, clear the image path in the database
        roadmap.image = null;
        await roadmap.save();
        res.status(200).json({ message: "Roadmap image deleted successfully." });
      });
    } else {
      // Image file not found on server, but it's referenced in DB. Clear DB reference.
      console.warn(`Image file not found at ${imagePathOnServer} for roadmap ${roadmapId}, but DB reference existed. Clearing DB reference.`);
      roadmap.image = null;
      await roadmap.save();
      res.status(200).json({ message: "Image file not found on server, but database reference has been cleared." });
    }
  } catch (error) {
    console.error("Error deleting roadmap image:", error);
    res.status(500).json({ message: "Server error while deleting roadmap image." });
  }
};

module.exports = {
  getAllRoadmaps,
  createRoadmap,
  getRoadmapById,
  updateRoadmap,
  deleteRoadmap,
  enrollUserInRoadmap, // Export the new function
  uploadRoadmapImage,
  getRoadmapImageFileById,
  deleteRoadmapImage
};


