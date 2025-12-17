// src/controllers/dashboardController.js

function getDb(req) {
  return req.app.get('db');
}

function getDashboardStats(req, res) {
  const db = getDb(req);
  const ownerId = req.user.id; // lấy id từ token

  // Tổng số, số Nam, số Nữ, max generation
  const sqlSummary = `
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN gender = 'Nam' THEN 1 ELSE 0 END) AS males,
      SUM(CASE WHEN gender = 'Nữ' THEN 1 ELSE 0 END) AS females,
      MAX(generation) AS maxGeneration
    FROM people
    WHERE owner_id = ?;
  `;

  db.get(sqlSummary, [ownerId], (err, row) => {
    if (err) {
      console.error('Lỗi query tổng quan:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }

    const total = (row.total) || 0;
    const males = row.males || 0;
    const females = row.females || 0;
    const maxGeneration = row.maxGeneration || 0;

    // Phân bố thế hệ
    const sqlGen = `
      SELECT generation, COUNT(*) AS count
      FROM people
      WHERE owner_id = ?
      GROUP BY generation
      ORDER BY generation ASC;
    `;
    db.all(sqlGen, [ownerId], (err2, genRows) => {
      if (err2) {
        console.error('Lỗi query generations:', err2.message);
        return res.status(500).json({ success: false, message: 'Lỗi server' });
      }

      const generations = genRows.map(r => ({
        generation: r.generation,
        count: r.count
      }));

      // Sinh nhật sắp tới: chỉ người còn sống của owner này
      const sqlBirthday = `
        SELECT id, full_name, birth_date
        FROM people
        WHERE owner_id = ?
          AND is_alive = 1
          AND birth_date IS NOT NULL
          AND birth_date != ''
      `;
      db.all(sqlBirthday, [ownerId], (err3, birthdayRows) => {
        if (err3) {
          console.error('Lỗi query birthdays:', err3.message);
          return res.status(500).json({ success: false, message: 'Lỗi server' });
        }

        const upcomingBirthdays = calcUpcomingBirthdays(birthdayRows, 45);
        const recentBirthdays = calcRecentBirthdays(birthdayRows, 45);

        const activities = recentBirthdays.map(item => ({
          id: item.id,
          full_name: item.full_name,
          type: 'birthday_recent',
          date: item.lastBirthday,
          daysAgo: item.daysAgo
        }));

        return res.json({
          success: true,
          stats: {
            total,
            males,
            females,
            maxGeneration,
            generations,
            upcomingBirthdays,
            activities
          }
        });
      });
    });
  });
}

function calcUpcomingBirthdays(rows, daysAhead) {
  const now = new Date();

  // Chuẩn hóa hôm nay về 00:00 để tránh lệch do giờ
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return rows
    .map(r => {
      if (!r.birth_date) return null;

      const birth = new Date(r.birth_date); // 'YYYY-MM-DD'
      // Sinh nhật năm nay (00:00)
      let next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());

      // Nếu sinh nhật năm nay đã qua (next < today) thì lấy sang năm sau
      if (next < today) {
        next = new Date(today.getFullYear() + 1, birth.getMonth(), birth.getDate());
      }

      const diffMs = next - today;
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)); // làm tròn lên

      function formatDateLocal(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
      return {
        id: r.id,
        full_name: r.full_name,
        birthday: r.birth_date,
        daysLeft: diffDays,
        nextBirthday: formatDateLocal(next)
      };
    })
    .filter(x => x && x.daysLeft >= 0 && x.daysLeft <= daysAhead)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

function calcRecentBirthdays(rows, daysBack) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return rows
    .map(r => {
      if (!r.birth_date) return null;

      const birth = new Date(r.birth_date);
      let last = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());

      if (last > today) {
        last = new Date(today.getFullYear() - 1, birth.getMonth(), birth.getDate());
      }

      const diffMs = today - last;
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      return {
        id: r.id,
        full_name: r.full_name,
        birthday: r.birth_date,
        lastBirthday: formatDateLocal(last),
        daysAgo: diffDays
      };
    })
    .filter(x => x && x.daysAgo >= 0 && x.daysAgo <= daysBack)
    .sort((a, b) => a.daysAgo - b.daysAgo);
}

function formatDateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

module.exports = {
  getDashboardStats
};
