const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Đường dẫn đến file database của bạn
const DB_PATH = path.resolve(__dirname, 'database', 'giapha.db');

const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error("❌ Lỗi kết nối DB:", err.message);
    return;
  }
  console.log("✅ Đã kết nối đến:", DB_PATH);
});

db.serialize(() => {
  // 1. Lấy danh sách tất cả các bảng để xác định bảng chứa user
  db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
    if (err) {
      console.error("Lỗi truy vấn bảng:", err);
      return;
    }
    
    console.log("\n📋 Danh sách các bảng trong DB:", tables.map(t => t.name));

    // 2. Các tên bảng thường gặp chứa tài khoản admin
    // Dựa vào code authRoutes có 'loginOwner', khả năng cao bảng tên là 'owners' hoặc 'users'
    const potentialTables = ['users', 'owners', 'accounts', 'admin', 'members'];

    potentialTables.forEach(tableName => {
      const tableExists = tables.find(t => t.name === tableName);
      if (tableExists) {
        console.log(`\n🔍 Đang đọc dữ liệu từ bảng '${tableName}'...`);
        db.all(`SELECT * FROM ${tableName}`, (err, rows) => {
          if (err) console.error(err);
          else if (rows.length === 0) console.log(`   (Bảng ${tableName} rỗng)`);
          else console.table(rows); // Hiển thị danh sách tài khoản
        });
      }
    });
  });
});