/**
 * Configuration Module
 * Centralized configuration management
 */

const path = require("path");
const fs = require("fs");

// Load .env từ thư mục gốc project (tương thích khi require config trực tiếp)
const envPath = path.resolve(__dirname, "../../.env");
if (fs.existsSync(envPath)) {
  require("dotenv").config({ path: envPath });
} else {
  require("dotenv").config();
}

const config = {
  // Server Configuration
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
    env: process.env.NODE_ENV || "development",
  },

  // Database Configuration
  database: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    name: process.env.DB_NAME || "mail_manager",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
    pool: {
      max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
      idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT, 10) || 30000,
      connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT, 10) || 2000,
    },
  },

  // Gmail SMTP Configuration
  gmail: {
    smtp: {
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
    },
  },

  // Email Configuration
  email: {
    // Thời gian nghỉ giữa các lần gửi email (ms).
    // Tăng mặc định lên 20000ms để giảm nguy cơ vào spam.
    delay: parseInt(process.env.EMAIL_DELAY, 10) || 20000,
    retryAttempts: parseInt(process.env.EMAIL_RETRY_ATTEMPTS, 10) || 3,
    retryDelay: parseInt(process.env.EMAIL_RETRY_DELAY, 10) || 5000,
  },

  // CORS Configuration
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  },
};

// Validate required configuration
function validateConfig() {
  const errors = [];

  if (!config.database.password) {
    errors.push("DB_PASSWORD is required in environment variables");
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join("\n")}`);
  }
}

// Validate on module load
if (config.server.env !== "test") {
  validateConfig();
}

module.exports = config;
