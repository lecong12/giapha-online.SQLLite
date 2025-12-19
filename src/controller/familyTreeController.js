// src/controller/familyTreeController.js
const { checkAuth } = require('../middleware/auth');

function getDb(req) {
  return req.app.get('db');
}

/**
 * API lấy dữ liệu cây gia phả
 * Hỗ trợ cả owner và viewer
 */
function getFamilyTreeData(req, res) {
  const db = getDb(req);
  const userId = req.user.id;
  const userRole = req.user.role;

  // Xác định ownerId
  if (userRole === 'viewer') {
    db.get(`SELECT owner_id FROM users WHERE id = ?`, [userId], (err, row) => {
      if (err || !row || !row.owner_id) {
        return res.status(403).json({ 
          success: false, 
          message: 'Không tìm thấy owner của viewer này' 
        });
      }
      
      fetchFamilyTreeData(db, row.owner_id, res);
    });
  } else {
    fetchFamilyTreeData(db, userId, res);
  }
}

/**
 * Helper function fetch data
 */
function fetchFamilyTreeData(db, ownerId, res) {
  // 1. Lấy tất cả people
const sqlPeople = `
  SELECT 
    id, full_name, gender, birth_date, death_date, is_alive,
    generation, avatar, biography, notes, member_type
  FROM people
  WHERE owner_id = ?
  ORDER BY generation ASC, id ASC
`;

  db.all(sqlPeople, [ownerId], (err, people) => {
    if (err) {
      console.error('Lỗi lấy people:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }

    // 2. Lấy relationships
    const sqlRel = `
      SELECT 
        r.id, r.parent_id, r.child_id, r.relation_type
      FROM relationships r
      INNER JOIN people p ON r.child_id = p.id
      WHERE p.owner_id = ?
    `;

    db.all(sqlRel, [ownerId], (err2, relationships) => {
      if (err2) {
        console.error('Lỗi lấy relationships:', err2.message);
        return res.status(500).json({ success: false, message: 'Lỗi server' });
      }

      // 3. Lấy marriages
      const sqlMar = `
        SELECT 
          m.id, m.husband_id, m.wife_id, 
          m.marriage_date, m.divorce_date, m.notes
        FROM marriages m
        INNER JOIN people p1 ON m.husband_id = p1.id
        WHERE p1.owner_id = ?
      `;

      db.all(sqlMar, [ownerId], (err3, marriages) => {
        if (err3) {
          console.error('Lỗi lấy marriages:', err3.message);
          return res.status(500).json({ success: false, message: 'Lỗi server' });
        }

        // ✅ RETURN DỮ LIỆU
        return res.json({
          success: true,
          data: {
            people,
            relationships,
            marriages
          }
        });
      });
    });
  });
}

module.exports = {
  getFamilyTreeData
};