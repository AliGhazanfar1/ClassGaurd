const express = require('express');
const adminController = require('../controllers/adminController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);
router.use(restrictTo('admin'));

router.post('/session', adminController.startSession);
router.put('/session/:id/stop', adminController.stopSession);
router.get('/session/active', adminController.getActiveSession);
router.get('/session/:id/attendance', adminController.getAttendanceList);
router.get('/session/:id/export', adminController.exportToExcel);
router.get('/export-all', adminController.exportAllSessions);
router.get('/students', adminController.getAllStudents);
router.get('/logs', adminController.getLogs);

module.exports = router;
