// src/routes/dashboardRoutes.js
const express = require('express');
const router = express.Router();
const { getDashboardStats } = require('../controller/dashboardController');
const { getFamilyTreeData } = require('../controller/familyTreeController'); // ← THÊM DÒNG NÀY

const { checkAuth } = require('../middleware/auth');

// Route cũ
router.get('/stats', checkAuth, getDashboardStats);

// ✅ THÊM ROUTE MỚI
router.get('/family-tree', checkAuth, getFamilyTreeData);

module.exports = router;