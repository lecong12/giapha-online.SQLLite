const db = require('./db');

console.log("🛠️ Đang tạo bảng 'members'...");

const createTableSql = `
    CREATE TABLE IF NOT EXISTS members (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(255),
        gender VARCHAR(50),
        birth_date VARCHAR(50),
        death_date VARCHAR(50),
        generation INTEGER,
        notes TEXT,
        phone VARCHAR(50),
        job VARCHAR(255),
        address TEXT,
        parent_name VARCHAR(255),
        spouse_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
`;

db.run(createTableSql, (err) => {
    if (err) {
        console.error("❌ Lỗi tạo bảng:", err.message);
    } else {
        console.log("✅ Đã tạo bảng 'members' thành công (hoặc bảng đã tồn tại).");
        console.log("👉 Bạn có thể bắt đầu import dữ liệu.");
    }
});