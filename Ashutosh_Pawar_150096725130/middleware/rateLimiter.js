const rateLimit = require("express-rate-limit");

// General cap for every /api route: 100 requests per 15 minutes per IP.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    success: false,
    message: "Too many requests from this IP, please try again after 15 minutes",
  },
  standardHeaders: true, // send RateLimit-* headers
  legacyHeaders: false, // drop the old X-RateLimit-* headers
});

// Strict cap on the booking route only: 10 requests per minute per IP.
// Scalper bots hammer this endpoint to grab seats, so it gets its own bucket.
const bookingLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: {
    success: false,
    message: "Too many booking attempts, slow down and try again in a minute",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { apiLimiter, bookingLimiter };
