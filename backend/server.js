const express = require("express");
const cors    = require("cors");
const path    = require("path");
require("dotenv").config();

const connectDB = require("./config/db");
const uploadRoutes = require("./routes/uploadRoutes");
const aiRoutes     = require("./routes/aiRoutes");
const authRoutes   = require("./routes/authRoutes");
const searchRoutes = require("./routes/searchRoutes");

// Bing proxy on port 5001 — strips X-Frame-Options so Bing loads in iframe
require("./proxyServer");


const app = express();

// Connect to MongoDB
connectDB();

// Restrict CORS to only the frontend origin
app.use(cors({
  origin: ["http://localhost:3000"],
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization", "x-gemini-key"],
}));

// Security headers
// Skip X-Frame-Options for /uploads (PDF files) and /pdf-viewer.html (custom viewer)
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  const noFrame = !req.path.startsWith("/uploads") && req.path !== "/pdf-viewer.html";
  if (noFrame) res.setHeader("X-Frame-Options", "DENY");
  next();
});

app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "public")));  // serves pdf-viewer.html, etc.

app.use("/api/auth",   authRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/ai",     aiRoutes);
app.use("/api/search", searchRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
