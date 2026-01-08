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

    // Map để lưu Tên -> ID (Dùng để tra cứu ở bước 2)
    const nameToIdMap = {};
    // Map phụ dùng key chữ thường để tra cứu không phân biệt hoa thường
    const nameToIdMapLower = {};
    // Set để tránh trùng lặp quan hệ vợ chồng (A-B và B-A)
    const processedMarriages = new Set();

    // --- BƯỚC 1: INSERT NGƯỜI VÀO BẢNG PEOPLE ---
    console.log("🔹 BƯỚC 1: Đang tạo hồ sơ thành viên...");
    let successCount = 0;
    let errorCount = 0;

    for (const row of rows) {
        // FIX: Luôn lưu tên Cha/Mẹ và Vợ/Chồng vào ghi chú để không bị mất thông tin nếu không link được ID
        let extraNotes = row.notes || '';
        if (row.parent_name) extraNotes += `\n[Cha/Mẹ: ${row.parent_name}]`;
        if (row.spouse_name) extraNotes += `\n[Vợ/Chồng: ${row.spouse_name}]`;
        // Xóa khoảng trắng thừa đầu cuối
        extraNotes = extraNotes.trim();

        const sql = `
            INSERT INTO people (
                owner_id, full_name, gender, birth_date, death_date, generation, 
                notes, phone, job, address, is_alive, member_type
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING id
        `;

        // Mặc định owner_id = 1 (Admin), is_alive = 1 (Còn sống), member_type = 'blood' (Huyết thống)
        const params = [
            1, row.full_name, row.gender, row.birth_date, row.death_date, row.generation,
            extraNotes, row.phone, row.job, row.address, 1, 'blood'
        ];

        // Dùng Promise để đợi DB xử lý xong dòng này mới qua dòng khác
        await new Promise(resolve => {
            // QUAN TRỌNG: Dùng function() thường thay vì arrow function để lấy 'this.lastID'
            db.run(sql, params, function(err) {
                if (err) {
                    console.error(`❌ Lỗi dòng '${row.full_name}':`, err.message);
                    errorCount++;
                } else {
                    // Lưu ID vừa tạo vào Map để dùng cho bước 2
                    if (this.lastID) {
                        nameToIdMap[row.full_name.trim()] = this.lastID;
                        nameToIdMapLower[row.full_name.trim().toLowerCase()] = this.lastID;
                    }
                    successCount++;
                }
                resolve();
            });
        });
    }

    console.log(`✅ Đã tạo ${Object.keys(nameToIdMap).length} thành viên trong bộ nhớ.`);

    // --- BƯỚC 2: TẠO QUAN HỆ (CHA CON / VỢ CHỒNG) ---
    console.log("🔹 BƯỚC 2: Đang liên kết quan hệ gia đình...");
    let relationCount = 0;

    for (const row of rows) {
        const myName = row.full_name.trim();
        const myId = nameToIdMap[myName];
        if (!myId) continue; // Nếu người này lỗi ở bước 1 thì bỏ qua

        // 2.1 Xử lý Cha/Mẹ (Parent)
        if (row.parent_name) {
            const pName = row.parent_name.trim();
            const parentId = nameToIdMap[pName] || nameToIdMapLower[pName.toLowerCase()];
            
            if (parentId) {
            const sqlRel = `INSERT INTO relationships (parent_id, child_id, relation_type) VALUES ($1, $2, 'blood')`;
            
            await new Promise(resolve => {
                db.run(sqlRel, [parentId, myId], (err) => {
                    if (!err) relationCount++;
                    resolve();
                });
            });
            } else {
                console.warn(`⚠️ Không tìm thấy hồ sơ cha/mẹ: '${pName}' cho '${myName}'`);
            }
        }

        // 2.2 Xử lý Vợ/Chồng (Spouse)
        if (row.spouse_name) {
            const sName = row.spouse_name.trim();
            // Tìm ID bằng tên chính xác HOẶC tên chữ thường
            const spouseId = nameToIdMap[sName] || nameToIdMapLower[sName.toLowerCase()];
            
            if (spouseId) {
                // Xác định ai là chồng, ai là vợ dựa trên giới tính
                let husbandId = myId;
                let wifeId = spouseId;
                
                // Chuẩn hóa giới tính để so sánh chính xác hơn (chấp nhận 'nữ', 'nu', 'female')
                const gender = (row.gender || '').trim().toLowerCase();
                if (gender === 'nữ' || gender === 'nu' || gender === 'female') {
                    husbandId = spouseId;
                    wifeId = myId;
                }

                // Tạo key duy nhất cho cặp vợ chồng (VD: "10-15") để không insert 2 lần
                const pairKey = [husbandId, wifeId].sort().join('-');
                
                if (!processedMarriages.has(pairKey)) {
                    processedMarriages.add(pairKey);

                    const sqlMarr = `INSERT INTO marriages (husband_id, wife_id, marriage_date) VALUES ($1, $2, $3)`;
                    await new Promise(resolve => {
                        db.run(sqlMarr, [husbandId, wifeId, ''], (err) => {
                            if (!err) relationCount++;
                            resolve();
                        });
                    });
                }
            } else {
                console.warn(`⚠️ Không tìm thấy hồ sơ vợ/chồng: '${sName}' cho '${myName}' (Đã lưu vào ghi chú)`);
            }
        }
    }

    console.log("------------------------------------------------");
    console.log(`🏁 Hoàn tất!`);
    console.log(`- Hồ sơ tạo mới: ${successCount}`);
    console.log(`- Quan hệ thiết lập: ${relationCount}`);
    console.log(`- Lỗi: ${errorCount}`);
};

importData();