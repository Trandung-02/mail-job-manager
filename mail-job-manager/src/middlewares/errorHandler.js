/**
 * Error Handling Middleware
 * Centralized error handling for Express
 */

const logger = require("../utils/logger");

const errorHandler = (err, req, res, _next) => {
  logger.error("Server error:", err.message);

  // Log stack trace in development
  if (process.env.NODE_ENV === "development") {
    logger.error("Stack trace:", err.stack);
  }

  // Handle specific error types
  if (err.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      error: "Validation error",
      details: err.message,
    });
  }

  if (err.name === "UnauthorizedError") {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
      details: err.message,
    });
  }

  // Default error response
  const statusCode = err.statusCode || err.status || 500;

  res.status(statusCode).json({
    success: false,
    error: err.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

module.exports = errorHandler;
