// server.js
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const cors = require("cors");

const app = express();

// ================== CẤU HÌNH CỔNG (PORT) ==================
// Chỉ khai báo PORT một lần duy nhất ở đây
const PORT = process.env.PORT || 8060; 

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Public folder
const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR));

// ================== ĐĂNG KÝ ROUTES ==================
// Đảm bảo các file này tồn tại trong thư mục src/routes
const authRoutes = require("./src/routes/authRoutes");
app.use("/api/auth", authRoutes);

const dashboardRoutes = require("./src/routes/dashboardRoutes");
app.use("/api/dashboard", dashboardRoutes);

const membersRoutes = require("./src/routes/membersRoutes");
app.use("/api/members", membersRoutes);

const settingsRoutes = require("./src/routes/settingsRoutes");
app.use("/api/settings", settingsRoutes);

const viewerRoutes = require("./src/routes/viewerRoutes");
app.use("/api/viewers", viewerRoutes);

const postsRoutes = require("./src/routes/postsRoutes");
app.use("/api/posts", postsRoutes);

const activityRoutes = require("./src/routes/activityRoutes");
app.use("/api/activities", activityRoutes);

// ================== HTML ROUTES ==================
app.get("/", (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "views", "root.html"));
});

app.get("/login", (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "views", "index.html"));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'views', 'dashboard.html'));
});

// ================== DATABASE ==================
// path.resolve giúp định vị chính xác file db trên hệ điều hành Linux của Render
const DB_PATH = path.resolve(__dirname, "database", "giapha.db");

const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error("❌ Không thể kết nối SQLite:", err.message);
    } else {
        console.log("✅ Kết nối SQLite thành công tại:", DB_PATH);
    }
});

app.set("db", db);

// ================== START SERVER ==================
// Sử dụng '0.0.0.0' để Render có thể kết nối được với ứng dụng
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server đang chạy thành công trên Port: ${PORT}`);
});
