const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

// Đường dẫn DB
const DB_PATH = path.resolve(__dirname, 'database', 'giapha.db');
const db = new sqlite3.Database(DB_PATH);

// Thông tin cần reset (Lấy từ kết quả tìm kiếm của bạn)
const targetEmail = 'lecong12@gmail.com'; 
const newPassword = '123456';             

// Tạo hash SHA256 (theo logic trong authController.js)
const newHash = crypto.createHash('sha256').update(newPassword).digest('hex');

db.serialize(() => {
  // Update cả cột password và password_hash để đảm bảo tương thích
  const sql = `UPDATE users SET password = ?, password_hash = ? WHERE email = ?`;
  
  db.run(sql, [newHash, newHash, targetEmail], function(err) {
    if (err) {
      console.error("❌ Lỗi:", err.message);
    } else {
      console.log(`✅ Đã reset mật khẩu thành công!`);
      console.log(`   Email:    ${targetEmail}`);
      console.log(`   Password: ${newPassword}`);
    }
    db.close();
  });
});