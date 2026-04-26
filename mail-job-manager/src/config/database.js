/**
 * Database Configuration
 * Handles database connection pooling and configuration
 */

const { Pool } = require("pg");
const config = require("./index");
const logger = require("../utils/logger");

// Clean password string
function cleanPassword(password) {
  if (!password) return "";

  let cleaned = String(password).trim();

  // Remove quotes if present
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1);
  }

  return cleaned;
}

// Database configuration
const dbConfig = {
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: cleanPassword(config.database.password),
  ...config.database.pool,
};

// Validate configuration
if (!dbConfig.password || dbConfig.password.trim() === "") {
  logger.error("DB_PASSWORD is not defined in environment variables");
  logger.info("\n💡 Please create a .env file in the root directory with:");
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  logger.info("DB_HOST=localhost");
  logger.info("DB_PORT=5432");
  logger.info("DB_NAME=mail_manager");
  logger.info("DB_USER=postgres");
  logger.info("DB_PASSWORD=your_password_here");
  logger.info("PORT=3000");
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  throw new Error("DB_PASSWORD is not defined");
}

// Log configuration (hide password)
logger.info("Database Configuration:");
logger.info(`   Host: ${dbConfig.host}`);
logger.info(`   Port: ${dbConfig.port}`);
logger.info(`   Database: ${dbConfig.database}`);
logger.info(`   User: ${dbConfig.user}`);
logger.info(`   Password: ${dbConfig.password ? "***" : "NOT SET"}`);
logger.info(`   Pool Max: ${dbConfig.max}`);

// Create connection pool
const pool = new Pool(dbConfig);

// Event handlers
pool.on("connect", () => {
  logger.success("Connected to PostgreSQL");
});

pool.on("error", (err) => {
  logger.error("PostgreSQL connection error:", err);
});

// Test connection
async function testConnection() {
  try {
    const result = await pool.query("SELECT NOW()");
    logger.success(`Database connection test successful: ${result.rows[0].now}`);
    return true;
  } catch (error) {
    logger.error(`Database connection test failed: ${error.message}`);
    return false;
  }
}

// Enhanced query function with logging
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug(`Query executed in ${duration}ms`, {
      rows: res.rowCount,
      text: text.substring(0, 100) + (text.length > 100 ? "..." : ""),
    });
    return res;
  } catch (error) {
    logger.error("Query error:", error);
    throw error;
  }
}

// Graceful shutdown (gọi từ server.js, tránh đăng ký process.on trùng)
async function closePool() {
  try {
    await pool.end();
    logger.info("Database pool closed");
  } catch (error) {
    logger.error("Error closing database pool:", error);
  }
}

module.exports = {
  pool,
  query,
  testConnection,
  closePool,
};
