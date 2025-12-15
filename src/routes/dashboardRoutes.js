// src/routes/dashboardRoutes.js
const express = require('express');
const router = express.Router();
const { getDashboardStats } = require('../controller/dashboardController');

// ================== MIDDLEWARE CHECK AUTH ==================
function checkAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const parts = authHeader.split(' ');

  // Format mong đợi: "Bearer id_{userId}_{randomPart}"
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ success: false, message: 'Thiếu hoặc sai header Authorization' });
  }

  const token = parts[1];

  try {
    const tokenParts = token.split('_');
    if (tokenParts.length < 3) throw new Error('Token format invalid');

    const prefix = tokenParts[0];
    const userIdPart = tokenParts[1];
    const randomPart = tokenParts.slice(2).join('_');

    if (prefix !== 'id') throw new Error('Token prefix invalid');

    const userId = Number(userIdPart);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new Error('User id invalid');
    }

    if (!randomPart || randomPart.trim() === '') {
      throw new Error('Random part invalid');
    }

    // Lưu userId vào req để controller dùng nếu cần
    req.user = { id: userId };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token không hợp lệ' });
  }
}

// ================== ROUTES DASHBOARD ==================

// GET /api/dashboard/stats
router.get('/stats', checkAuth, getDashboardStats);

module.exports = router;
