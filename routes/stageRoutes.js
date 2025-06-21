const express = require('express');
const router = express.Router();
const stageController = require('../controllers/stageController');
const authMiddleware = require("../middleware/authMiddleware"); // Assuming middleware path
const checkAdminRole = require("../middleware/checkAdminRole");


router.use(authMiddleware);

// Create a new stage
router.post('/create',checkAdminRole, stageController.createStage);

// Delete a stage
router.delete('/delete/:id',checkAdminRole, stageController.deleteStage);

// Get progress for a stage
router.get('/:stageId/progress', stageController.getStageProgress);

// Get a stage by ID
router.get('/:id',checkAdminRole, stageController.getStageById);

// Update a stage
router.put('/update/:id',checkAdminRole, stageController.updateStage);

// Get all stages
router.get('/',checkAdminRole, stageController.getAllStages);

// Get Stages by Roadmap
router.get('/roadmap/:id', stageController.getStagesByRoadmap);

module.exports = router;