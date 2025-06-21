const express = require('express');
const {
  requestPasswordReset,
  resetPassword,
} = require('../controllers/resetPasswordController');

const router = express.Router();

router.post('/reset-password', requestPasswordReset);
router.post('/reset-password/:token', resetPassword);

module.exports = router;