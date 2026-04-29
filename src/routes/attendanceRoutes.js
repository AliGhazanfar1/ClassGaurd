const express = require('express');
const attendanceController = require('../controllers/attendanceController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);
router.use(restrictTo('student'));

router.post('/mark', attendanceController.markAttendance);

module.exports = router;
