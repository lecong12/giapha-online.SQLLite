function getDb(req) {
  return req.app.get('db');
}

function getDashboardStats(req, res) {
  const db = getDb(req);
  const ownerId = req.user.role === 'viewer' ? req.user.owner_id : req.user.id;

  const stats = {};

  // 1. Tổng quan
  const sqlOverview = `
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN gender = 'Nam' THEN 1 ELSE 0 END) as males,
      SUM(CASE WHEN gender = 'Nữ' THEN 1 ELSE 0 END) as females,
      MAX(generation) as maxGeneration
    FROM people WHERE owner_id = ?
  `;

  db.get(sqlOverview, [ownerId], (err, row) => {
    if (err) return res.status(500).json({ success: false, message: 'Lỗi server' });

    stats.total = row.total || 0;
    stats.males = row.males || 0;
    stats.females = row.females || 0;
    stats.maxGeneration = row.maxGeneration || 0;

    // 2. Phân bố thế hệ
    const sqlGen = `SELECT generation, COUNT(*) as count FROM people WHERE owner_id = ? GROUP BY generation`;
    db.all(sqlGen, [ownerId], (err2, gens) => {
      stats.generations = gens || [];

      // 3. Sinh nhật & Ngày giỗ sắp tới (30 ngày)
      const sqlPeople = `SELECT id, full_name, birth_date, death_date, is_alive FROM people WHERE owner_id = ?`;
      
      db.all(sqlPeople, [ownerId], (err3, people) => {
        if (err3) {
          console.error('❌ Lỗi getDashboardStats (People):', err3.message);
          return res.status(500).json({ success: false, message: 'Lỗi lấy dữ liệu thành viên' });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const currentYear = today.getFullYear();

        const upcoming = [];
        const upcomingDeathAnniversaries = [];
        const peopleList = Array.isArray(people) ? people : [];

        peopleList.forEach(p => {
          // --- Xử lý Sinh nhật (Người còn sống) ---
          if (p.is_alive && p.birth_date && p.birth_date !== 'unknown') {
            const birth = new Date(p.birth_date);
            const nextBirthday = new Date(currentYear, birth.getMonth(), birth.getDate());
            if (nextBirthday < today) nextBirthday.setFullYear(currentYear + 1);

            const diffDays = Math.ceil((nextBirthday - today) / (1000 * 60 * 60 * 24));
            if (diffDays <= 30) {
              upcoming.push({
                ...p,
                daysLeft: diffDays,
                nextBirthday: nextBirthday.toISOString().split('T')[0],
                birthday: p.birth_date
              });
            }
          }

          // --- Xử lý Ngày giỗ (Người đã mất) ---
          if (!p.is_alive && p.death_date && p.death_date !== 'unknown') {
            const death = new Date(p.death_date);
            const nextAnniversary = new Date(currentYear, death.getMonth(), death.getDate());
            if (nextAnniversary < today) nextAnniversary.setFullYear(currentYear + 1);

            const diffDays = Math.ceil((nextAnniversary - today) / (1000 * 60 * 60 * 24));
            const yearCount = nextAnniversary.getFullYear() - death.getFullYear();

            if (diffDays <= 30) {
              upcomingDeathAnniversaries.push({
                ...p,
                daysLeft: diffDays,
                nextAnniversary: nextAnniversary.toISOString().split('T')[0],
                yearCount: yearCount,
                death_date: p.death_date
              });
            }
          }
        });

        stats.upcomingBirthdays = upcoming.sort((a, b) => a.daysLeft - b.daysLeft);
        stats.upcomingDeathAnniversaries = upcomingDeathAnniversaries.sort((a, b) => a.daysLeft - b.daysLeft);

        // 4. Hoạt động gần đây
        const sqlActivity = `SELECT * FROM activity_logs WHERE owner_id = ? ORDER BY created_at DESC LIMIT 10`;
        db.all(sqlActivity, [ownerId], (err4, activities) => {
          stats.activities = activities || [];
          
          res.json({ success: true, stats });
        });
      });
    });
  });
}

module.exports = { getDashboardStats };