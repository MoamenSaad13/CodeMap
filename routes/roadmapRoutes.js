const express = require("express");
const router = express.Router();
const roadmapController = require("../controllers/roadmapController");
const { uploadRoadmapImage, getRoadmapImageFileById, deleteRoadmapImage } = require("../controllers/roadmapController"); // Added deleteRoadmapImage
const authMiddleware = require("../middleware/authMiddleware"); // Assuming middleware path
const checkAdminRole = require("../middleware/checkAdminRole");

router.get("/", roadmapController.getAllRoadmaps);
router.get("/:id", roadmapController.getRoadmapById);

router.use(authMiddleware);

router.post("/create",checkAdminRole, roadmapController.createRoadmap);
router.put("/update/:id",checkAdminRole, roadmapController.updateRoadmap);
router.delete("/delete/:id",checkAdminRole, roadmapController.deleteRoadmap); // This deletes the entire roadmap
router.post("/upload-roadmap-image/:id",checkAdminRole, uploadRoadmapImage);
router.get("/:id/image",checkAdminRole, getRoadmapImageFileById);


// New route to delete a roadmap's image by roadmap ID
router.delete("/:id/image",checkAdminRole, deleteRoadmapImage);

module.exports = router;
