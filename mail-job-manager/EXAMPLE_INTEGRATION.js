/**
 * Example: Cách tích hợp các module mới vào server.js
 * 
 * File này minh họa cách sử dụng các module mới đã tạo
 * Copy các phần cần thiết vào server.js hiện tại
 */

const express = require("express");
const path = require("path");

// ============================================
// Import các module mới
// ============================================
const config = require("./src/config");
const { testConnection } = require("./src/config/database");
const logger = require("./src/utils/logger");

// Routes mới (optimized)
const jobRoutes = require("./src/routes/jobRoutes");

// Middleware mới
const errorHandler = require("./src/middlewares/errorHandler");
const corsMiddleware = require("./src/middlewares/cors");

// ============================================
// Express App Setup
// ============================================
const app = express();

// Middleware
app.use(express.json());
app.use(express.static(__dirname));
app.use(corsMiddleware);

// ============================================
// Routes Mới (Optimized)
// ============================================
// Sử dụng route mới với batch queries (tối ưu hiệu năng)
app.use("/api/jobs", jobRoutes);

// ============================================
// Routes Cũ (Giữ lại tạm thời để test)
// ============================================
// Nếu muốn test song song, có thể dùng prefix khác
// app.use("/api/jobs-old", oldJobRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    version: "2.0.0-optimized"
  });
});

// ============================================
// Error Handler (Phải đặt ở cuối)
// ============================================
app.use(errorHandler);

// ============================================
// Server Startup
// ============================================
async function startServer() {
  // Test database connection
  const dbConnected = await testConnection();
  if (!dbConnected) {
    logger.error("Không thể kết nối database. Vui lòng kiểm tra cấu hình.");
    process.exit(1);
  }

  app.listen(config.server.port, () => {
    logger.success(`Server đang chạy tại http://localhost:${config.server.port}`);
    logger.info(`Frontend: http://localhost:${config.server.port}/index.html`);
    logger.info(`CRUD: http://localhost:${config.server.port}/crud.html`);
    logger.info(`Health: http://localhost:${config.server.port}/api/health`);
  });
}

startServer();

/**
 * SO SÁNH:
 * 
 * TRƯỚC:
 * - Tất cả code trong 1 file (3235 dòng)
 * - N+1 queries cho GET /api/jobs
 * - Error handling không nhất quán
 * - Console.log rải rác
 * - Khó test và maintain
 * 
 * SAU:
 * - Modular architecture
 * - Batch queries (1 query thay vì 100+ queries)
 * - Centralized error handling
 * - Structured logging
 * - Dễ test và maintain
 */

