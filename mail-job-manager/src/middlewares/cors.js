/**
 * CORS Middleware
 * Configure CORS headers
 */

const config = require("../config");

const corsMiddleware = (req, res, next) => {
  res.header("Access-Control-Allow-Origin", config.cors.origin);
  res.header("Access-Control-Allow-Headers", config.cors.allowedHeaders.join(", "));
  res.header("Access-Control-Allow-Methods", config.cors.methods.join(", "));

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
};

module.exports = corsMiddleware;
