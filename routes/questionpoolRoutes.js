const express = require("express");
const router = express.Router();
const questionpoolController = require("../controllers/questionpoolController");

const authMiddleware = require("../middleware/authMiddleware");
const checkAdminRole = require("../middleware/checkAdminRole");

// All routes are protected and require admin role
router.use(authMiddleware);
router.use(checkAdminRole);

router.post("/create", questionpoolController.createQuestionPool)
router.get("/",questionpoolController.getQuestionPools);

router.get("/:id",questionpoolController.getQuestionPoolById)
router.put("/update/:id",questionpoolController.updateQuestionPool)
router.delete("/delete/:id",questionpoolController.deleteQuestionPool);

module.exports = router;