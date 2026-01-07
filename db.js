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
        } else {
            console.log("🔌 Đang sử dụng SQLite (Local Mode)");
            this.db = null;
        }
    }

    connect(callback) {
        if (isPostgres) {
            // Test kết nối
            this.pool.query('SELECT NOW()', (err, res) => {
                if (callback) callback(err);
            });
        } else {
            const DB_DIR = path.join(__dirname, '../../database');
            if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
            const DB_PATH = path.resolve(DB_DIR, "giapha.db");
            
            this.db = new sqlite3.Database(DB_PATH, (err) => {
                if (err) console.error("❌ Lỗi kết nối SQLite:", err.message);
                else console.log("✅ SQLite Connected:", DB_PATH);
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

    _convertSql(sql) {
        if (!isPostgres) return sql;
        
        let i = 1;
        let newSql = sql.replace(/\?/g, () => `$${i++}`);
        
        // Chuyển đổi cú pháp tạo bảng từ SQLite sang Postgres
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
            this.pool.query(convertedSql, params, (err, res) => {
                if (callback) {
                    const context = {
                        lastID: res && res.rows.length > 0 ? res.rows[0].id : 0,
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