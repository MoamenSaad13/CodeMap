const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');

const authMiddleware = require("../middleware/authMiddleware"); // Assuming middleware path
const checkAdminRole = require("../middleware/checkAdminRole");

router.use(authMiddleware);

// Get categories for a specific stage
router.get('/stage/:id', categoryController.getCategoriesByStage);

// Create a new category
router.post('/create',checkAdminRole, categoryController.createCategory);

// Get all categories
router.get('/',checkAdminRole, categoryController.getAllCategories);

// Get category by ID
router.get('/:id',checkAdminRole, categoryController.getCategoryById);

// Update category
router.put('/update/:id',checkAdminRole, categoryController.updateCategory);

// Delete category
router.delete('/delete/:id',checkAdminRole, categoryController.deleteCategory);

// Get categories for a specific roadmap
router.get('/roadmap/:id', categoryController.getCategoriesByRoadmap);


module.exports = router;