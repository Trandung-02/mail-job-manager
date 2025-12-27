/**
 * Database Connection Module
 * Kết nối PostgreSQL sử dụng pg
 */

const path = require("path");
const fs = require("fs");

// Thử nhiều cách để tìm file .env
let envPath = null;
const possiblePaths = [
  path.resolve(__dirname, ".env"), // Thư mục hiện tại
  path.join(process.cwd(), ".env"), // Working directory
  ".env", // Relative path
];

// Tìm file .env
for (const possiblePath of possiblePaths) {
  if (fs.existsSync(possiblePath)) {
    envPath = possiblePath;
    console.log(`✅ Tìm thấy file .env tại: ${envPath}`);
    break;
  }
}

if (!envPath) {
  console.error(`❌ File .env không tồn tại tại các vị trí:`);
  possiblePaths.forEach((p) => console.error(`   - ${p}`));
  console.error(`   Thư mục hiện tại (__dirname): ${__dirname}`);
  console.error(`   Working directory (cwd): ${process.cwd()}`);

  // Thử tạo file .env tự động
  const defaultEnvPath = path.resolve(__dirname, ".env");
  try {
    const defaultContent = `DB_HOST=localhost
DB_PORT=5432
DB_NAME=mail_manager
DB_USER=postgres
DB_PASSWORD=Vboyht@02
PORT=3000
`;
    fs.writeFileSync(defaultEnvPath, defaultContent, "utf8");
    console.log(`✅ Đã tự động tạo file .env tại: ${defaultEnvPath}`);
    envPath = defaultEnvPath;
  } catch (error) {
    console.error(`❌ Không thể tạo file .env tự động:`, error.message);
  }
}

// Load file .env với path cụ thể
let result = { error: null };
if (envPath) {
  result = require("dotenv").config({ path: envPath });
} else {
  // Thử load không chỉ định path (dotenv sẽ tìm tự động)
  result = require("dotenv").config();
}

// Debug: Kiểm tra xem dotenv có load được không
if (result.error) {
  console.error("❌ Lỗi khi đọc file .env:", result.error);
  console.error("   Path:", envPath);
} else {
  console.log("✅ Đã load file .env thành công");
}

const { Pool } = require("pg");

// Debug: In ra tất cả các biến môi trường liên quan đến DB
console.log("🔍 Debug biến môi trường:");
console.log("   DB_HOST:", process.env.DB_HOST || "UNDEFINED");
console.log("   DB_PORT:", process.env.DB_PORT || "UNDEFINED");
console.log("   DB_NAME:", process.env.DB_NAME || "UNDEFINED");
console.log("   DB_USER:", process.env.DB_USER || "UNDEFINED");
console.log(
  "   DB_PASSWORD:",
  process.env.DB_PASSWORD
    ? "*** (length: " + process.env.DB_PASSWORD.length + ")"
    : "UNDEFINED"
);
console.log("   DB_PASSWORD type:", typeof process.env.DB_PASSWORD);

// Đọc và validate các biến môi trường
// Đảm bảo password luôn là string, ngay cả khi undefined
let dbPassword = process.env.DB_PASSWORD;
if (dbPassword === undefined || dbPassword === null) {
  dbPassword = "";
}

// Chuyển đổi sang string nếu chưa phải string
if (typeof dbPassword !== "string") {
  dbPassword = String(dbPassword);
}

// Loại bỏ dấu ngoặc kép nếu có (dotenv có thể giữ nguyên dấu ngoặc kép)
if (dbPassword.startsWith('"') && dbPassword.endsWith('"')) {
  dbPassword = dbPassword.slice(1, -1);
}
if (dbPassword.startsWith("'") && dbPassword.endsWith("'")) {
  dbPassword = dbPassword.slice(1, -1);
}

const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || "mail_manager",
  user: process.env.DB_USER || "postgres",
  password: dbPassword, // Đảm bảo luôn là string
  max: 20, // Số lượng kết nối tối đa trong pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// Validate password - đảm bảo không rỗng
if (!dbConfig.password || dbConfig.password.trim() === "") {
  console.error("❌ Lỗi: DB_PASSWORD không được định nghĩa trong file .env");
  console.error("\n💡 Vui lòng tạo file .env trong thư mục gốc với nội dung:");
  console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.error("DB_HOST=localhost");
  console.error("DB_PORT=5432");
  console.error("DB_NAME=mail_manager");
  console.error("DB_USER=postgres");
  console.error("DB_PASSWORD=Vboyht@02");
  console.error("PORT=3000");
  console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.error(
    "\nLưu ý: Nếu password có ký tự đặc biệt, có thể cần đặt trong dấu ngoặc kép:"
  );
  console.error('DB_PASSWORD="Vboyht@02"');
  throw new Error("DB_PASSWORD không được định nghĩa");
}

// Log cấu hình (ẩn password)
console.log("📊 Cấu hình database:");
console.log(`   Host: ${dbConfig.host}`);
console.log(`   Port: ${dbConfig.port}`);
console.log(`   Database: ${dbConfig.database}`);
console.log(`   User: ${dbConfig.user}`);
console.log(`   Password: ${dbConfig.password ? "***" : "KHÔNG CÓ"}`);

// Cấu hình kết nối database
const pool = new Pool(dbConfig);

// Test kết nối khi khởi động
pool.on("connect", () => {
  console.log("✅ Đã kết nối đến PostgreSQL");
});

pool.on("error", (err) => {
  console.error("❌ Lỗi kết nối PostgreSQL:", err);
});

// Test kết nối
async function testConnection() {
  try {
    const result = await pool.query("SELECT NOW()");
    console.log("✅ Kết nối database thành công:", result.rows[0].now);
    return true;
  } catch (error) {
    console.error("❌ Lỗi kết nối database:", error.message);
    console.error("Chi tiết lỗi:", error);

    // Gợi ý khắc phục
    if (error.message.includes("password must be a string")) {
      console.error("\n💡 Gợi ý khắc phục:");
      console.error("1. Kiểm tra file .env có tồn tại không");
      console.error(
        "2. Đảm bảo DB_PASSWORD trong .env là string (có dấu ngoặc kép nếu cần)"
      );
      console.error(
        '3. Ví dụ: DB_PASSWORD="Vboyht@02" hoặc DB_PASSWORD=Vboyht@02'
      );
    }

    return false;
  }
}

// Helper function để thực thi query
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log("Executed query", { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error("Query error:", error);
    throw error;
  }
}

// Đóng pool khi ứng dụng tắt
process.on("SIGINT", async () => {
  await pool.end();
  console.log("Database pool đã đóng");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await pool.end();
  console.log("Database pool đã đóng");
  process.exit(0);
});

module.exports = {
  pool,
  query,
  testConnection,
};
