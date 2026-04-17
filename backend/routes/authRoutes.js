const express    = require("express");
const rateLimit  = require("express-rate-limit");
const { register, login } = require("../controllers/authController");

const router = express.Router();

// Block brute-force: max 5 login attempts per IP per 15 minutes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limit registration to 10 per IP per hour (prevents spam accounts)
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { error: "Too many accounts created. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/register", registerLimiter, register);
router.post("/login",    loginLimiter,    login);

module.exports = router;
