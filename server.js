const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const cors = require("cors");

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
const DB_PATH = path.resolve(__dirname, "database", "giapha.db");
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error("❌ Lỗi DB:", err.message);
    else console.log("✅ DB Connect:", DB_PATH);
});
app.set("db", db);

// START SERVER. thiêu
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Live tại Port: ${PORT}`);
});
