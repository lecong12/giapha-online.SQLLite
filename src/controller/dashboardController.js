// src/controllers/dashboardController.js

function getDb(req) {
  return req.app.get('db');
}

function getDashboardStats(req, res) {
  const db = getDb(req);

  // Tổng số, số Nam, số Nữ, max generation
  const sqlSummary = `
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN gender = 'Nam' THEN 1 ELSE 0 END) AS males,
      SUM(CASE WHEN gender = 'Nữ' THEN 1 ELSE 0 END) AS females,
      MAX(generation) AS maxGeneration
    FROM people;
  `;

  db.get(sqlSummary, [], (err, row) => {
    if (err) {
      console.error('Lỗi query tổng quan:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }

    const total = (row.total - 1) || 0;
    const males = row.males || 0;
    const females = row.females || 0;
    const maxGeneration = row.maxGeneration || 0;

    // Phân bố thế hệ
    const sqlGen = `
      SELECT generation, COUNT(*) AS count
      FROM people
      GROUP BY generation
      ORDER BY generation ASC;
    `;
    db.all(sqlGen, [], (err2, genRows) => {
      if (err2) {
        console.error('Lỗi query generations:', err2.message);
        return res.status(500).json({ success: false, message: 'Lỗi server' });
      }

      const generations = genRows.map(r => ({
        generation: r.generation,
        count: r.count
      }));

      // Sinh nhật sắp tới: dùng birth_date
      const sqlBirthday = `
        SELECT id, full_name, birth_date
        FROM people
        WHERE birth_date IS NOT NULL AND birth_date != ''
      `;
      db.all(sqlBirthday, [], (err3, birthdayRows) => {
        if (err3) {
          console.error('Lỗi query birthdays:', err3.message);
          return res.status(500).json({ success: false, message: 'Lỗi server' });
        }

        const upcomingBirthdays = calcUpcomingBirthdays(birthdayRows, 30);

        // Hoạt động gần đây: tạm dùng updated_at (hoặc created_at nếu bạn muốn)
        const sqlActivities = `
          SELECT id, full_name, updated_at
          FROM people
          WHERE updated_at IS NOT NULL
          ORDER BY datetime(updated_at) DESC
          LIMIT 5;
        `;
        db.all(sqlActivities, [], (err4, actRows) => {
          if (err4) {
            console.error('Lỗi query activities:', err4.message);
            return res.status(500).json({ success: false, message: 'Lỗi server' });
          }

          const activities = actRows.map(r => ({
            id: r.id,
            full_name: r.full_name,
            type: 'update_person', // label cho UI, bạn có thể đổi
            at: r.updated_at
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
  });
}

// birth_date dạng 'YYYY-MM-DD'
function calcUpcomingBirthdays(rows, daysAhead) {
  const now = new Date();

  return rows
    .map(r => {
      if (!r.birth_date) return null;
      const b = new Date(r.birth_date);
      const thisYear = new Date(now.getFullYear(), b.getMonth(), b.getDate());
      if (thisYear < now) thisYear.setFullYear(now.getFullYear() + 1);
      const diffDays = Math.round((thisYear - now) / (1000 * 60 * 60 * 24));

      return {
        id: r.id,
        full_name: r.full_name,
        birthday: r.birth_date,
        daysLeft: diffDays,
        nextBirthday: thisYear.toISOString().slice(0, 10)
      };
    })
    .filter(x => x && x.daysLeft >= 0 && x.daysLeft <= daysAhead)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

module.exports = {
  getDashboardStats
};
