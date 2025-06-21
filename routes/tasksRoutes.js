const express = require('express');
const router = express.Router();
const {
  getAllTasks, 
  getTaskById, 
  updateTask, 
  deleteTask, 
  getMyTasks,
  startQuiz,
  checkQuizTimeLimit,

} = require('../controllers/tasksController');
const authMiddleware = require('../middleware/authMiddleware');
const checkAdminRole = require("../middleware/checkAdminRole");

// Routes that require authentication
router.use(authMiddleware);

// Routes for all users
router.get('/my-tasks', getMyTasks);
router.get('/:id', getTaskById);
router.post('/start/:taskId', startQuiz);
router.get('/time-check/:taskId', checkQuizTimeLimit);

router.put('/update/:id', updateTask);

// Routes that require admin role
router.use(checkAdminRole);
router.get('/', getAllTasks);
router.delete('/delete/:id', deleteTask);

module.exports = router;