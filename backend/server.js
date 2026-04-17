const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const connectDB = require("./config/db");
const uploadRoutes = require("./routes/uploadRoutes");
const aiRoutes = require("./routes/aiRoutes");
const authRoutes = require("./routes/authRoutes");
const searchRoutes = require("./routes/searchRoutes");
if (process.env.NODE_ENV !== "production") {
  require("./proxyServer");
}

const app = express();

// Render sits behind a proxy, so Express must trust forwarded IP headers.
app.set("trust proxy", 1);

connectDB();

const allowedOrigins = new Set(
  ["http://localhost:3000", process.env.FRONTEND_URL].filter(Boolean)
);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;

  try {
    const frontendUrl = process.env.FRONTEND_URL
      ? new URL(process.env.FRONTEND_URL)
      : null;
    const requestUrl = new URL(origin);

    if (
      frontendUrl &&
      frontendUrl.hostname.endsWith(".netlify.app") &&
      requestUrl.protocol === frontendUrl.protocol
    ) {
      const siteName = frontendUrl.hostname.replace(".netlify.app", "");
      return (
        requestUrl.hostname === frontendUrl.hostname ||
        requestUrl.hostname.endsWith(`--${siteName}.netlify.app`)
      );
    }
  } catch (error) {
    return false;
  }

  return false;
}

app.use(
  cors({
    origin: function (origin, callback) {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-gemini-key"],
  })
);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  const noFrame =
    !req.path.startsWith("/uploads") && req.path !== "/pdf-viewer.html";
  if (noFrame) res.setHeader("X-Frame-Options", "DENY");
  next();
});

app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "public")));

app.use("/api/auth", authRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/search", searchRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

app.get("/", (req, res) => {
  res.send("CAR XML backend is running");
});
