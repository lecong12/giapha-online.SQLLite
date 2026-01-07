const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class DatabaseAdapter {
    constructor() {
        console.log("🔌 Đang sử dụng SQLite (Local Mode - Forced)");
        this.db = null;
    }

    connect(callback) {
        // Database folder nằm cùng cấp
        const DB_DIR = path.join(__dirname, 'database');
        if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
        const DB_PATH = path.resolve(DB_DIR, "giapha.db");
        
        this.db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) console.error("❌ Lỗi kết nối SQLite:", err.message);
            else console.log("✅ SQLite Connected:", DB_PATH);
            if (callback) callback(err);
        });
    }

    serialize(callback) {
        this.db.serialize(callback);
    }

    run(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        this.db.run(sql, params, callback);
    }

    get(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        this.db.get(sql, params, callback);
    }

    all(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        this.db.all(sql, params, callback);
    }
}

module.exports = new DatabaseAdapter();