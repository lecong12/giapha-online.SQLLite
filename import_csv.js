// Load biến môi trường để tránh lỗi kết nối DB
require('dotenv').config();

const fs = require('fs');
const csv = require('csv-parser');
const db = require('./db');

// Đổi tên file này nếu file CSV của bạn tên khác
const inputFile = 'data.csv'; 

const importData = async () => {
    const rows = [];
    
    // 1. Đọc file CSV
    console.log(`⏳ Đang đọc file '${inputFile}'...`);
    
    try {
        const stream = fs.createReadStream(inputFile).pipe(csv());
        
        for await (const row of stream) {
            // Chuẩn hóa tên cột (xóa khoảng trắng thừa nếu có)
            const cleanRow = {};
            Object.keys(row).forEach(key => {
                cleanRow[key.trim()] = row[key];
            });
            rows.push(cleanRow);
        }
    } catch (e) {
        console.error("❌ Lỗi đọc file:", e.message);
        console.log("👉 Hãy chắc chắn bạn đã chạy: npm install csv-parser");
        console.log("👉 Và file 'data.csv' nằm cùng thư mục với file này.");
        return;
    }

    console.log(`✅ Đã đọc ${rows.length} dòng. Bắt đầu import vào DB...`);

    // 2. Insert từng dòng vào Database
    let successCount = 0;
    let errorCount = 0;

    for (const row of rows) {
        // Gộp thông tin cha/vợ chồng vào ghi chú vì bảng people dùng ID liên kết
        let extraNotes = row.notes || '';
        if (row.parent_name) extraNotes += ` | Cha/Mẹ: ${row.parent_name}`;
        if (row.spouse_name) extraNotes += ` | Vợ/Chồng: ${row.spouse_name}`;

        const sql = `
            INSERT INTO people (
                owner_id, full_name, gender, birth_date, death_date, generation, 
                notes, phone, job, address, is_alive
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        // Mặc định owner_id = 1 (Admin), is_alive = 1 (Còn sống)
        const params = [
            1, row.full_name, row.gender, row.birth_date, row.death_date, row.generation,
            extraNotes, row.phone, row.job, row.address, 1
        ];

        // Dùng Promise để đợi DB xử lý xong dòng này mới qua dòng khác
        await new Promise(resolve => {
            db.run(sql, params, (err) => {
                if (err) {
                    console.error(`❌ Lỗi dòng '${row.full_name}':`, err.message);
                    errorCount++;
                } else {
                    successCount++;
                }
                resolve();
            });
        });
    }

    console.log("------------------------------------------------");
    console.log(`🏁 Hoàn tất! Thành công: ${successCount}, Lỗi: ${errorCount}`);
};

importData();