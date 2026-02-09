const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class DatabaseAdapter {
    constructor() {
        this.db = null;
        console.log("🔌 Đang khởi tạo Adapter SQLite...");
    }

    // Hàm kết nối
    connect(callback) {
        const dbPath = path.resolve(__dirname, 'giapha.db');
        console.log(`📂 Database Path: ${dbPath}`);
        
        this.db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error("❌ Lỗi kết nối SQLite:", err.message);
            } else {
                console.log("✅ Kết nối SQLite thành công!");
                // Kích hoạt Foreign Keys (SQLite mặc định tắt)
                this.db.run("PRAGMA foreign_keys = ON");
            }
            if (callback) callback(err);
        });
    }

    // Hàm serialize (SQLite cần cái này để chạy tuần tự)
    serialize(callback) {
        if (this.db) {
            this.db.serialize(callback);
        } else if (callback) {
            callback();
        }
    }

    // Hàm thực thi lệnh (INSERT, UPDATE, DELETE)
    run(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        
        // Dùng function() thường để giữ context 'this' (chứa lastID, changes)
        this.db.run(sql, params, function(err) {
            if (callback) {
                callback.call(this, err);
            }
        });
    }

    // Hàm lấy 1 dòng dữ liệu
    get(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        this.db.get(sql, params, callback);
    }

    // Hàm lấy nhiều dòng dữ liệu
    all(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        this.db.all(sql, params, callback);
    }
}

module.exports = new DatabaseAdapter();