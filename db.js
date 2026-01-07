const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

// Kiểm tra xem có đang chạy trên Render với Postgres không
const isPostgres = !!process.env.DATABASE_URL;

class DatabaseAdapter {
    constructor() {
        if (isPostgres) {
            this.pool = new Pool({
                connectionString: process.env.DATABASE_URL,
                ssl: { rejectUnauthorized: false } // Bắt buộc cho Render
            });
            console.log("🔌 Đang sử dụng PostgreSQL (Render Mode)");
            // Log một phần URL để chắc chắn (giấu mật khẩu)
            const dbUrl = process.env.DATABASE_URL;
            console.log("   Target DB Host:", dbUrl.split('@')[1] ? dbUrl.split('@')[1].split(':')[0] : 'Unknown');
        } else {
            console.log("🔌 Đang sử dụng SQLite (Local Mode)");
            this.db = null;
        }
    }

    connect(callback) {
        if (isPostgres) {
            // Test kết nối Postgres
            this.pool.query('SELECT NOW()', (err, res) => {
                if (err) {
                    console.error("❌ Lỗi kết nối PostgreSQL:", err.message);
                } else {
                    console.log("✅ Kết nối PostgreSQL thành công!");
                }
                if (callback) callback(err);
            });
        } else {
            // Database folder nằm cùng cấp
            const DB_DIR = path.join(__dirname, 'database');
            if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
            const DB_PATH = path.resolve(DB_DIR, "giapha.db");
            
            this.db = new sqlite3.Database(DB_PATH, (err) => {
                if (err) console.error("❌ Lỗi kết nối SQLite:", err.message);
                else console.log("✅ SQLite Connected (File):", DB_PATH);
                if (callback) callback(err);
            });
        }
    }

    serialize(callback) {
        if (isPostgres) {
            if (callback) callback();
        } else {
            this.db.serialize(callback);
        }
    }

    // Hàm chuyển đổi cú pháp SQL từ SQLite sang Postgres
    _convertSql(sql) {
        if (!isPostgres) return sql;
        
        let i = 1;
        // Xóa dấu chấm phẩy ở cuối nếu có (để tránh lỗi khi nối chuỗi RETURNING)
        let newSql = sql.trim();
        if (newSql.endsWith(';')) {
            newSql = newSql.slice(0, -1);
        }

        // Thay thế ? bằng $1, $2...
        newSql = newSql.replace(/\?/g, () => `$${i++}`);
        
        // Chuyển đổi cú pháp tạo bảng
        newSql = newSql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
        
        // Thêm RETURNING id cho INSERT để lấy ID vừa tạo (giống this.lastID của SQLite)
        if (/^INSERT/i.test(newSql.trim()) && !/RETURNING/i.test(newSql)) {
            newSql += ' RETURNING id';
        }
        
        return newSql;
    }

    run(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }

        if (isPostgres) {
            const convertedSql = this._convertSql(sql);
            // console.log("📝 SQL Exec:", convertedSql); // Uncomment nếu muốn debug từng query
            
            this.pool.query(convertedSql, params, (err, res) => {
                if (err) {
                    console.error("❌ PG Query Error:", err.message, "\nSQL:", convertedSql);
                }
                if (callback) {
                    // Giả lập context 'this' của SQLite cho Postgres
                    // FIX QUAN TRỌNG: Lấy ID của dòng cuối cùng được insert (SQLite behavior)
                    const lastID = res && res.rows.length > 0 ? res.rows[res.rows.length - 1].id : 0;
                    
                    const context = {
                        lastID: lastID,
                        changes: res ? res.rowCount : 0
                    };
                    callback.call(context, err);
                }
            });
        } else {
            this.db.run(sql, params, callback);
        }
    }

    get(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }

        if (isPostgres) {
            const convertedSql = this._convertSql(sql);
            this.pool.query(convertedSql, params, (err, res) => {
                const row = res && res.rows.length > 0 ? res.rows[0] : undefined;
                if (callback) callback(err, row);
            });
        } else {
            this.db.get(sql, params, callback);
        }
    }

    all(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }

        if (isPostgres) {
            const convertedSql = this._convertSql(sql);
            this.pool.query(convertedSql, params, (err, res) => {
                const rows = res ? res.rows : [];
                if (callback) callback(err, rows);
            });
        } else {
            this.db.all(sql, params, callback);
        }
    }
}

module.exports = new DatabaseAdapter();