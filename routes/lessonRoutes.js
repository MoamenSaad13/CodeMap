const express = require('express');
const router = express.Router();
const {
    createLesson,
    getLessonById,
    getAllLessons,
    getLessonsByRoadmap,
    getLessonsByStage,
    getLessonsByCategory,
    updateLesson,
    deleteLesson,
    markLessonAsCompleted,
    checkLessonAvailability,
    getCompletedLessons,
    checkCategoryCompletionAndGenerateTask
} = require('../controllers/lessonController');
const authMiddleware = require("../middleware/authMiddleware"); // Assuming middleware path
const checkAdminRole = require("../middleware/checkAdminRole");

router.use(authMiddleware);

// Routes for specific fixed paths or actions
router.get('/', checkAdminRole, getAllLessons); // Get all lessons
router.get('/completed', authMiddleware, getCompletedLessons); // Get completed lessons
router.post('/create', checkAdminRole, createLesson); // Create a lesson

// Routes with specific prefixes and parameters (more specific than general :id)
router.post('/complete/:id', authMiddleware, markLessonAsCompleted); // Mark a lesson as completed
router.get('/available/:id', authMiddleware, checkLessonAvailability); // Check if a lesson is available to take
router.get('/roadmap/:id', getLessonsByRoadmap); // Get lessons by roadmap
router.get('/stage/:id', checkAdminRole, getLessonsByStage); // Get lessons by stage
router.get('/category/:id', getLessonsByCategory); // Get lessons by category
router.put('/update/:id', checkAdminRole, updateLesson); // Update a lesson
router.delete('/delete/:id', checkAdminRole, deleteLesson); // Delete a lesson

// General route for getting a lesson by ID (should be last to avoid conflicts)
router.get('/:id', getLessonById);

// Note: checkCategoryCompletionAndGenerateTask is not exposed as an API endpoint
// as it's called internally by the markLessonAsCompleted function

module.exports = router;