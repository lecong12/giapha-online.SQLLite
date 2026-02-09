const express = require('express');
const router = express.Router();
const settingsController = require('../controller/settingsController');
const { checkAuth } = require('../middleware/auth');

// Định nghĩa các routes cho Settings
router.get('/export-pdf', checkAuth, settingsController.exportPDF);
router.post('/import-csv', checkAuth, settingsController.uploadMiddleware, settingsController.importCSV);
router.post('/reset-data', checkAuth, settingsController.resetData);
router.delete('/delete-all-members', checkAuth, settingsController.deleteAllMembers);

module.exports = router;