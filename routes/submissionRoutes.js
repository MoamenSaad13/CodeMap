const express = require('express');
const router = express.Router();
const { 

  getSubmissionById, 
  getSubmissionsForTask, 
  getMySubmissions,
  submitQuiz,
} = require('../controllers/submissionController');
const authMiddleware = require('../middleware/authMiddleware');
const checkAdminRole = require("../middleware/checkAdminRole");

// Routes that require authentication
router.use(authMiddleware);

// Routes for all users

router.post('/submit-quiz/:taskId', submitQuiz);
router.get('/my-submissions', getMySubmissions);
router.get('/:submissionId', getSubmissionById);

// Routes that require admin role
router.use(checkAdminRole);
router.get('/task/:taskId', getSubmissionsForTask);

module.exports = router;