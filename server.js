const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const cors = require("cors");
const fs = require("fs");

const app = express();
// KHAI BÁO PORT DUY NHẤT Ở ĐÂY
const PORT = process.env.PORT || 8060;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR));

// ROUTES (Đảm bảo các file này có trong thư mục src/routes)
app.use("/api/auth", require("./src/routes/authRoutes"));
app.use("/api/dashboard", require("./src/routes/dashboardRoutes"));
app.use("/api/members", require("./src/routes/membersRoutes"));
app.use("/api/settings", require("./src/routes/settingsRoutes"));
app.use("/api/viewers", require("./src/routes/viewerRoutes"));
app.use("/api/posts", require("./src/routes/postsRoutes"));
app.use("/api/activities", require("./src/routes/activityRoutes"));

// HTML ROUTES
app.get("/", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "views", "root.html")));
app.get("/login", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "views", "index.html")));
app.get('/dashboard', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'views', 'dashboard.html')));

// DATABASE (Dùng path.resolve để Render tìm đúng file)
const DB_DIR = path.join(__dirname, "database");

// Tự động tạo thư mục database nếu chưa có (Fix lỗi deploy bị crash)
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.resolve(DB_DIR, "giapha.db");
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error("❌ Lỗi DB:", err.message);
    } else {
        console.log("✅ DB Connect:", DB_PATH);
        
        // Tự động tạo bảng users nếu chưa có (Quan trọng khi Deploy)
        const sqlCreateUsers = `
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT,
                password TEXT,
                password_hash TEXT,
                full_name TEXT,
                role TEXT,
                owner_id INTEGER,
                viewer_code TEXT
            )
        `;
        
        db.run(sqlCreateUsers, (errCreate) => {
            if (errCreate) {
                console.error("❌ Lỗi tạo bảng users:", errCreate.message);
            } else {
                console.log("✅ Đã khởi tạo bảng 'users' thành công");

                // --- TẠO TÀI KHOẢN MẶC ĐỊNH (Nếu chưa có) ---
                const checkSql = "SELECT id FROM users WHERE email = 'admin@gmail.com'";
                db.get(checkSql, (err, row) => {
                    if (!row) {
                        // Hash SHA256 của '123456'
                        const passHash = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';
                        const insertSql = `
                            INSERT INTO users (email, password, password_hash, full_name, role, viewer_code) 
                            VALUES (?, ?, ?, ?, 'owner', 'ADMIN12345')
                        `;
                        db.run(insertSql, ['admin@gmail.com', passHash, passHash, 'Admin Mặc Định'], (errInsert) => {
                            if (!errInsert) {
                                console.log("\n👉 Đã tạo tài khoản Admin: admin@gmail.com / 123456\n");
                            }
                        });
                    }
                });
            }
        });
    }
});
app.set("db", db);

// START SERVER
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Live tại Port: ${PORT}`);
});
