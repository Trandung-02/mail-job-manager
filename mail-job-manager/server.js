/**
 * Mail Job Manager Server
 * Express server với Gmail API để gửi email
 * Refactored version with clean architecture
 */

const express = require("express");
const config = require("./src/config");
const { testConnection, closePool } = require("./src/config/database");
const logger = require("./src/utils/logger");
const errorHandler = require("./src/middlewares/errorHandler");
const corsMiddleware = require("./src/middlewares/cors");

// Import routes
const jobRoutes = require("./src/routes/jobRoutes");
const profileRoutes = require("./src/routes/profileRoutes");
const runRoutes = require("./src/routes/runRoutes");
const resultRoutes = require("./src/routes/resultRoutes");

// ============================================
// Express App Setup
// ============================================
const app = express();

// Security: Trust proxy (for rate limiting behind reverse proxy)
app.set("trust proxy", 1);

// Middleware
app.use(express.json({ limit: "10mb" })); // Limit request body size
app.use(express.static(__dirname));
app.use(corsMiddleware);

// Rate limiting (optional - uncomment if express-rate-limit is installed)
// const { apiLimiter, emailLimiter } = require("./src/middlewares/rateLimiter");
// app.use("/api", apiLimiter);
// app.use("/api/run-job", emailLimiter);
// app.use("/api/jobs/:id/run", emailLimiter);

// ============================================
// API Routes
// ============================================

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Job routes (CRUD operations - optimized with batch queries)
app.use("/api/jobs", jobRoutes);

// Profile routes (GET /api/profiles)
app.use("/api/profiles", profileRoutes);

// Run routes (execute jobs)
app.use("/api", runRoutes);

// Result routes (email results, statistics, failed emails)
app.use("/api", resultRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

// ============================================
// Server Startup
// ============================================
async function startServer() {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      logger.error("Không thể kết nối database. Server sẽ không khởi động.");
      process.exit(1);
    }

    // Start server
    const PORT = config.server.port;
    app.listen(PORT, () => {
      logger.success(`🚀 Server đang chạy tại http://localhost:${PORT}`);
      logger.info(`📧 Mail Job Manager API đã sẵn sàng`);
      logger.info(`📊 Environment: ${config.server.env}`);
    });
  } catch (error) {
    logger.error("Lỗi khi khởi động server:", error);
    process.exit(1);
  }
}

// Start server
startServer();

// Graceful shutdown: đóng pool DB trước khi thoát
process.on("SIGINT", async () => {
  logger.info("\n🛑 Đang tắt server...");
  await closePool();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("\n🛑 Đang tắt server...");
  await closePool();
  process.exit(0);
});

module.exports = app;
