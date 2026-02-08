require('dotenv').config(); // ✅ Load biến môi trường
const { Pool } = require('pg');

// Lấy chuỗi kết nối từ biến môi trường
const connectionString = process.env.DATABASE_URL;

class DatabaseAdapter {
    constructor() {
        // Kiểm tra biến môi trường
        if (!connectionString) {
            console.warn("⚠️ CẢNH BÁO: Không tìm thấy biến môi trường DATABASE_URL.");
            console.warn("👉 Nếu chạy trên Render: Hãy vào tab Environment và thêm DATABASE_URL.");
        }

        // Cấu hình Pool kết nối PostgreSQL
        this.pool = new Pool({
            connectionString: connectionString,
            // Tự động bật SSL nếu không phải localhost (Render yêu cầu SSL)
            // ✅ Thêm check 127.0.0.1 cho Windows/Local
            ssl: (connectionString && (connectionString.includes('localhost') || connectionString.includes('127.0.0.1')))
                ? false 
                : { rejectUnauthorized: false },
            max: 20, // Số lượng kết nối tối đa
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000, // ✅ Tăng lên 10s để tránh timeout khi DB ngủ đông
        });

        // Xử lý lỗi pool toàn cục
        this.pool.on('error', (err, client) => {
            console.error('❌ Lỗi kết nối PostgreSQL bất ngờ:', err);
        });

        console.log("🔌 Đang khởi tạo Adapter PostgreSQL...");
    }

    // Hàm kết nối (dùng để test khi khởi động server)
    connect(callback) {
        this.pool.query('SELECT NOW()', (err, res) => {
            if (err) {
                console.error("❌ Lỗi kết nối PostgreSQL:", err.message);
            } else {
                console.log("✅ Kết nối PostgreSQL thành công!");
            }
            if (callback) callback(err);
        });
    }

    // Hàm serialize (Giữ lại để tương thích interface, PG xử lý bất đồng bộ tự nhiên)
    serialize(callback) {
        if (callback) callback();
    }

    // --- HÀM XỬ LÝ SQL: Hỗ trợ cú pháp $1, $2 và tự động lấy ID ---
    _convertSql(sql) {
        if (!sql) return "";

        let i = 1;
        let newSql = sql.trim();

        // 1. Xóa dấu chấm phẩy ở cuối để tránh lỗi cú pháp khi nối thêm RETURNING
        newSql = newSql.replace(/;\s*$/, "");

        // 2. Nếu query dùng dấu ? (kiểu cũ), chuyển sang $1, $2... (Chuẩn PostgreSQL)
        newSql = newSql.replace(/\?/g, () => `$${i++}`);
        
        // 3. Chuyển đổi cú pháp tạo bảng (nếu còn sót lại từ code cũ)
        newSql = newSql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
        // INT PRIMARY KEY -> SERIAL PRIMARY KEY (phòng hờ)
        newSql = newSql.replace(/INTEGER PRIMARY KEY/gi, 'SERIAL PRIMARY KEY');
        
        // 4. Tự động thêm RETURNING id cho lệnh INSERT
        // (Để lấy được ID vừa tạo giống như this.lastID của SQLite)
        if (/^INSERT/i.test(newSql) && !/RETURNING/i.test(newSql)) {
            newSql += ' RETURNING id';
        }
        
        return newSql;
    }

    // Hàm thực thi lệnh (INSERT, UPDATE, DELETE)
    run(sql, params, callback) {
        // Xử lý overloading (nếu không truyền params)
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }

        const convertedSql = this._convertSql(sql);
        
        this.pool.query(convertedSql, params, (err, res) => {
            if (err) {
                console.error("❌ Lỗi SQL (Run):", err.message);
                console.error("   Query:", convertedSql);
                if (callback) callback(err);
                return;
            }

            if (callback) {
                // Lấy ID của dòng vừa insert (PostgreSQL trả về qua RETURNING id)
                let lastID = 0;
                if (res && res.rows && res.rows.length > 0) {
                    // Lấy ID từ dòng cuối cùng (thường là dòng vừa insert)
                    const lastRow = res.rows[res.rows.length - 1];
                    lastID = lastRow.id || 0;
                }
                
                const context = {
                    lastID: lastID,
                    changes: res ? res.rowCount : 0
                };
                
                // Gọi callback và bind context (để dùng được this.lastID)
                callback.call(context, null);
            }
        });
    }

    // Hàm lấy 1 dòng dữ liệu (SELECT ... LIMIT 1)
    get(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }

        const convertedSql = this._convertSql(sql);

        this.pool.query(convertedSql, params, (err, res) => {
            if (err) {
                console.error("❌ Lỗi SQL (Get):", err.message);
                console.error("   Query:", convertedSql);
                if (callback) callback(err);
                return;
            }
            
            const row = res && res.rows.length > 0 ? res.rows[0] : undefined;
            if (callback) callback(null, row);
        });
    }

    // Hàm lấy nhiều dòng dữ liệu (SELECT *)
    all(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }

        const convertedSql = this._convertSql(sql);

        this.pool.query(convertedSql, params, (err, res) => {
            if (err) {
                console.error("❌ Lỗi SQL (All):", err.message);
                console.error("   Query:", convertedSql);
                if (callback) callback(err);
                return;
            }

            const rows = res ? res.rows : [];
            
            // DEBUG: In ra keys của dòng đầu tiên để kiểm tra vấn đề chữ hoa/thường
            if (rows.length > 0) {
                console.log("🔍 DEBUG (All): Tên cột trả về từ DB:", Object.keys(rows[0]));
            }

            if (callback) callback(null, rows);
        });
    }
}

module.exports = new DatabaseAdapter();