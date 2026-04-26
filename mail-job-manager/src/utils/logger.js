/**
 * Logger Utility
 * Centralized logging with different log levels
 */

const logLevels = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

const currentLogLevel = process.env.LOG_LEVEL
  ? logLevels[process.env.LOG_LEVEL.toUpperCase()] || logLevels.INFO
  : logLevels.INFO;

const logger = {
  error: (message, ...args) => {
    if (currentLogLevel >= logLevels.ERROR) {
      console.error(`❌ [ERROR] ${message}`, ...args);
    }
  },

  warn: (message, ...args) => {
    if (currentLogLevel >= logLevels.WARN) {
      console.warn(`⚠️ [WARN] ${message}`, ...args);
    }
  },

  info: (message, ...args) => {
    if (currentLogLevel >= logLevels.INFO) {
      console.log(`ℹ️ [INFO] ${message}`, ...args);
    }
  },

  debug: (message, ...args) => {
    if (currentLogLevel >= logLevels.DEBUG) {
      console.log(`🔍 [DEBUG] ${message}`, ...args);
    }
  },

  success: (message, ...args) => {
    if (currentLogLevel >= logLevels.INFO) {
      console.log(`✅ [SUCCESS] ${message}`, ...args);
    }
  },
};

module.exports = logger;
