require('dotenv').config(); // ✅ Load biến môi trường đầu tiên
const express = require("express");
const path = require("path");
const cors = require("cors");
const fs = require("fs");
const dbAdapter = require("./db"); // Import Adapter SQLite

const app = express();
// KHAI BÁO PORT DUY NHẤT Ở ĐÂY
const PORT = process.env.PORT || 8060;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR));

// ROUTES (Đảm bảo các file này có trong thư mục src/routes)
// ✅ Thêm Try-Catch để tránh sập app nếu thiếu file route
function loadRoute(pathUrl, requirePath) {
    try {
        app.use(pathUrl, require(requirePath));
        console.log(`✅ Route loaded: ${pathUrl}`);
    } catch (error) {
        console.error(`⚠️ CẢNH BÁO: Không tìm thấy file route cho '${pathUrl}' (${requirePath}).`);
        console.error(`   👉 Lỗi: ${error.message}`);
    }
}

loadRoute("/api/auth", "./src/routes/authRoutes");
loadRoute("/api/dashboard", "./src/routes/dashboardRoutes");
loadRoute("/api/members", "./src/routes/membersRoutes");
loadRoute("/api/settings", "./src/routes/settingsRoutes");
loadRoute("/api/viewers", "./src/routes/viewerRoutes");
loadRoute("/api/posts", "./src/routes/postsRoutes");
loadRoute("/api/activities", "./src/routes/activityRoutes");

// ROUTE KIỂM TRA DATABASE (Thêm đoạn này để test)
app.get('/api/db-check', (req, res) => {
    dbAdapter.get("SELECT sqlite_version() as version", (err, row) => {
        if (err) {
            res.status(500).json({ status: 'Lỗi kết nối', error: err.message });
        } else {
            res.json({ 
                status: '✅ Đang chạy SQLite', 
                version: row ? row.version : 'Không xác định' 
            });
        }
    });
});

// ✅ ROUTE HEALTH CHECK (Quan trọng cho Render/Heroku)
app.get('/api/health', (req, res) => res.status(200).send('Giapha Online API is running...'));

// HTML ROUTES
app.get("/", (req, res) => res.redirect("/login"));
app.get("/app", (req, res) => { // Đổi root path của app client sang /app hoặc giữ nguyên nếu muốn serve static ở root
    const rootPath = path.join(PUBLIC_DIR, "views", "root.html");
    if (fs.existsSync(rootPath)) {
        res.sendFile(rootPath);
    } else {
        res.redirect("/login");
    }
});
app.get("/login", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "views", "index.html")));
app.get('/dashboard', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'views', 'dashboard.html')));

// DATABASE (Dùng path.resolve để Render tìm đúng file)
function initializeAndStartServer() {
    console.log("⏳ Đang kết nối Database...");
    dbAdapter.connect((err) => {
        if (err) {
            console.error("❌ Lỗi kết nối DB:", err.message);
            // QUAN TRỌNG: Thoát ngay để Render biết là deploy thất bại
            process.exit(1);
        }
        
        app.set("db", dbAdapter); // Cung cấp dbAdapter thay vì sqlite3 gốc

        // Tuần tự hóa các lệnh DB để đảm bảo mọi thứ sẵn sàng trước khi server chạy
        console.log("⏳ Đang kiểm tra và tạo bảng...");
        dbAdapter.serialize(() => {
            // Danh sách các bảng cần tạo
            const tableSchemas = [
                `CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT UNIQUE,
                    password TEXT,
                    password_hash TEXT,
                    full_name TEXT,
                    role TEXT,
                    owner_id INTEGER,
                    viewer_code TEXT
                )`,
                `CREATE TABLE IF NOT EXISTS people (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    owner_id INTEGER,
                    full_name TEXT,
                    gender TEXT,
                    birth_date TEXT,
                    death_date TEXT,
                    is_alive INTEGER,
                    avatar TEXT,
                    biography TEXT,
                    generation INTEGER,
                    notes TEXT,
                    phone TEXT,
                    job TEXT,
                    address TEXT,
                    member_type TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`,
                `CREATE TABLE IF NOT EXISTS relationships (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    parent_id INTEGER,
                    child_id INTEGER,
                    relation_type TEXT
                )`,
                `CREATE TABLE IF NOT EXISTS marriages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    husband_id INTEGER,
                    wife_id INTEGER,
                    marriage_date TEXT,
                    divorce_date TEXT,
                    notes TEXT
                )`,
                `CREATE TABLE IF NOT EXISTS posts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    owner_id INTEGER,
                    author_id INTEGER,
                    author_role TEXT,
                    title TEXT,
                    content TEXT,
                    category TEXT,
                    is_pinned INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`,
                `CREATE TABLE IF NOT EXISTS activity_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    owner_id INTEGER,
                    actor_id INTEGER,
                    actor_role TEXT,
                    actor_name TEXT,
                    action_type TEXT,
                    entity_type TEXT,
                    entity_name TEXT,
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`
            ];

            let completed = 0;
            const total = tableSchemas.length;

            tableSchemas.forEach((sql) => {
                dbAdapter.run(sql, (err) => {
                    if (err) {
                        console.error("❌ Lỗi tạo bảng:", err.message);
                        // Nếu lỗi tạo bảng, dừng server ngay để tránh chạy tiếp với DB lỗi
                        process.exit(1);
                    }
                    
                    completed++;
                    if (completed === total) {
                        console.log("✅ Tất cả bảng đã sẵn sàng.");
                        checkAdminAndStart();
                    }
                });
            });

            function checkAdminAndStart() {
                // 2. Tạo tài khoản Admin mặc định nếu chưa có
                console.log("⏳ Đang kiểm tra tài khoản Admin...");
                const checkSql = "SELECT id, full_name FROM users WHERE email = 'admin@gmail.com'";
                dbAdapter.get(checkSql, (err, row) => {
                    if (err) {
                        console.error("❌ Lỗi kiểm tra admin:", err.message);
                        process.exit(1);
                    }

                    if (!row) {
                        const passHash = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';
                        const insertSql = `INSERT INTO users (email, password, password_hash, full_name, role, viewer_code) VALUES (?, ?, ?, ?, 'owner', 'ADMIN12345')`;
                        
                        // ✅ Dùng function() thường để lấy this.lastID
                        dbAdapter.run(insertSql, ['admin@gmail.com', passHash, passHash, 'Admin'], function(errInsert) {
                            if (errInsert) {
                                console.error("❌ Lỗi tạo tài khoản Admin:", errInsert.message);
                                process.exit(1);
                            }
                            
                            // ✅ Cập nhật owner_id cho Admin
                            const newAdminId = this.lastID;
                            dbAdapter.run("UPDATE users SET owner_id = ? WHERE id = ?", [newAdminId, newAdminId], () => {
                                console.log(`\n👉 Đã tạo tài khoản Admin: admin@gmail.com / 123456 (ID: ${newAdminId})\n`);
                                startListening();
                            });
                        });
                    } else {
                        // Nếu tài khoản đã tồn tại nhưng tên vẫn là "Admin Mặc Định", hãy sửa lại
                        if (row.full_name === 'Admin Mặc Định') {
                            dbAdapter.run("UPDATE users SET full_name = 'Admin' WHERE email = 'admin@gmail.com'", () => {
                                console.log("✅ Đã cập nhật tên hiển thị từ 'Admin Mặc Định' thành 'Admin'");
                                startListening();
                            });
                        } else {
                            startListening(); // Bắt đầu lắng nghe nếu user đã tồn tại và tên đúng
                        }
                    }
                });
            }
        });
    });
}

// START SERVER
function startListening() {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Live tại Port: ${PORT}`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
}

// Khởi động toàn bộ tiến trình
initializeAndStartServer();
