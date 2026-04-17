# CAR Proofreader Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 5 comparison false-positive checks with fuzzy matching, add JWT login/register system, and fully redesign the frontend UI to Style B (white + purple gradient, color-coded data, Issues Panel at top, floating AI chat, click-to-jump).

**Architecture:** Backend gets a rewritten comparisonEngine.js (fuzzy matching via string-similarity) plus a new auth system (User model + JWT middleware). Frontend gets a full ProofreadingWorkspace rewrite in Style B plus new Login/Register pages with protected routing. All existing parsers and AI engines remain untouched.

**Tech Stack:** Node.js/Express, MongoDB/Mongoose, JWT, bcryptjs, string-similarity, React (no TypeScript), react-router-dom (already installed)

---

## File Map

| File | Action |
|------|--------|
| `backend/.env` | Add MONGODB_URI and JWT_SECRET |
| `backend/config/db.js` | Add Mongoose connection |
| `backend/engines/comparisonEngine.js` | Full rewrite — fuzzy matching |
| `backend/models/User.js` | New — Mongoose user schema |
| `backend/middleware/authMiddleware.js` | New — JWT verification |
| `backend/controllers/authController.js` | New — register + login logic |
| `backend/routes/authRoutes.js` | New — /api/auth endpoints |
| `backend/server.js` | Add db connect + auth route |
| `frontend/src/WorkspaceTheme.css` | New — Style B design tokens |
| `frontend/src/pages/LoginPage.jsx` | New — login form |
| `frontend/src/pages/RegisterPage.jsx` | New — register form |
| `frontend/src/App.js` | Add protected routes + login/register routes |
| `frontend/src/components/AIChat.jsx` | Rewrite — floating drawer |
| `frontend/src/components/ErrorPanel.jsx` | Rewrite — top panel + jump callback |
| `frontend/src/components/ProofreadingWorkspace.jsx` | Full rewrite — Style B |
| `frontend/src/components/ProofreadingWorkspace.css` | Keep existing (overridden by WorkspaceTheme.css) |

---

## Task 1: Install Backend Packages

**Files:** `backend/package.json`

- [ ] **Step 1: Install packages**

```bash
cd backend
npm install string-similarity bcryptjs jsonwebtoken mongoose
```

Expected output: `added N packages` with no errors.

- [ ] **Step 2: Verify install**

```bash
node -e "require('string-similarity'); require('bcryptjs'); require('jsonwebtoken'); require('mongoose'); console.log('OK')"
```

Expected: prints `OK`

---

## Task 2: Update .env and db.js

**Files:** `backend/.env`, `backend/config/db.js`

- [ ] **Step 1: Add env variables to `backend/.env`**

Add these two lines at the bottom (keep the existing GEMINI_API_KEY line):

```
MONGODB_URI=mongodb://localhost:27017/car_proofreader
JWT_SECRET=car_proofreader_secret_2026
```

- [ ] **Step 2: Write `backend/config/db.js`**

```js
const mongoose = require("mongoose");

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
```

---

## Task 3: Rewrite comparisonEngine.js

**Files:** `backend/engines/comparisonEngine.js`

- [ ] **Step 1: Replace the entire file**

```js
const stringSimilarity = require("string-similarity");

/**
 * Compare XML and PDF parsed data using fuzzy matching.
 * Returns array of { field, status, message, xml, pdf }
 * status: "match" | "warning" | "mismatch" | "info"
 */
function compareXMLPDF(xmlData, pdfData) {
  const results = [];

  // ── TITLE ──────────────────────────────────────────────────────────────────
  if (xmlData.title && pdfData.title) {
    const score = stringSimilarity.compareTwoStrings(
      normalize(xmlData.title),
      normalize(pdfData.title)
    );
    if (score >= 0.92) {
      results.push({ field: "Title", status: "match", message: "Titles match", xml: xmlData.title, pdf: pdfData.title });
    } else if (score >= 0.75) {
      results.push({ field: "Title", status: "warning", message: `Titles are similar but differ slightly (${pct(score)}% match)`, xml: xmlData.title, pdf: pdfData.title });
    } else {
      results.push({ field: "Title", status: "mismatch", message: `Titles differ significantly (${pct(score)}% match)`, xml: xmlData.title, pdf: pdfData.title });
    }
  }

  // ── AUTHORS ────────────────────────────────────────────────────────────────
  if (xmlData.authors && xmlData.authors.length > 0 && pdfData.fullText) {
    const pdfLower = pdfData.fullText.toLowerCase();
    const notFound = [];

    xmlData.authors.forEach(author => {
      const given = (author.givenName || "").trim();
      const surname = (author.surname || "").trim();
      const initials = (author.initials || "").replace(/\./g, "").trim();

      if (!given && !surname) return;

      // Build candidate formats
      const candidates = [
        `${given} ${surname}`,
        `${surname} ${given}`,
        `${surname} ${initials}`,
        `${initials} ${surname}`,
        `${surname}, ${given}`,
        `${surname}, ${initials}`,
      ].map(c => c.toLowerCase().replace(/\s+/g, " ").trim()).filter(c => c.length > 2);

      const found = candidates.some(c => pdfLower.includes(c));
      if (!found) notFound.push(`${given} ${surname}`.trim());
    });

    if (notFound.length === 0) {
      results.push({ field: "Authors", status: "match", message: "All authors found in PDF" });
    } else if (notFound.length <= Math.ceil(xmlData.authors.length / 2)) {
      results.push({ field: "Authors", status: "warning", message: `Some authors not clearly found in PDF: ${notFound.join(", ")}` });
    } else {
      results.push({ field: "Authors", status: "mismatch", message: `Most authors not found in PDF: ${notFound.join(", ")}` });
    }
  }

  // ── ABSTRACT ───────────────────────────────────────────────────────────────
  if (xmlData.abstract && pdfData.abstract) {
    const xmlAbs = normalize(xmlData.abstract).substring(0, 400);
    const pdfAbs = normalize(pdfData.abstract).substring(0, 400);
    const score = stringSimilarity.compareTwoStrings(xmlAbs, pdfAbs);

    if (score >= 0.85) {
      results.push({ field: "Abstract", status: "match", message: "Abstracts match" });
    } else if (score >= 0.70) {
      results.push({ field: "Abstract", status: "warning", message: `Abstracts are similar but differ (${pct(score)}% match)`, xml: xmlData.abstract?.substring(0, 120) + "...", pdf: pdfData.abstract?.substring(0, 120) + "..." });
    } else {
      results.push({ field: "Abstract", status: "mismatch", message: `Abstracts differ significantly (${pct(score)}% match)`, xml: xmlData.abstract?.substring(0, 120) + "...", pdf: pdfData.abstract?.substring(0, 120) + "..." });
    }
  }

  // ── REFERENCES — always info, never error ──────────────────────────────────
  if (xmlData.references && pdfData.references) {
    const xmlCount = xmlData.references.length;
    const pdfCount = pdfData.references.length;
    results.push({
      field: "References",
      status: "info",
      message: `XML has ${xmlCount} references | PDF extracted ${pdfCount} — PDF count may be incomplete due to formatting`,
      xml: String(xmlCount),
      pdf: String(pdfCount),
    });
  }

  // ── KEYWORDS ───────────────────────────────────────────────────────────────
  if (xmlData.keywords && xmlData.keywords.length > 0 && pdfData.fullText) {
    const pdfLower = pdfData.fullText.toLowerCase();
    const missing = xmlData.keywords.filter(kw => !pdfLower.includes(kw.toLowerCase().trim()));

    if (missing.length === 0) {
      results.push({ field: "Keywords", status: "match", message: "All keywords found in PDF" });
    } else if (missing.length <= Math.ceil(xmlData.keywords.length / 2)) {
      results.push({ field: "Keywords", status: "warning", message: `Some keywords not found in PDF: ${missing.join(", ")}` });
    } else {
      results.push({ field: "Keywords", status: "mismatch", message: `Most keywords not found in PDF: ${missing.join(", ")}` });
    }
  }

  // ── AFFILIATIONS ───────────────────────────────────────────────────────────
  if (xmlData.affiliations && xmlData.affiliations.length > 0 && pdfData.fullText) {
    const pdfLower = pdfData.fullText.toLowerCase();
    const stopWords = new Set(["of", "the", "and", "for", "a", "in", "at", "to"]);
    const notFound = [];

    xmlData.affiliations.forEach(aff => {
      const org = aff.organization || "";
      if (!org) return;

      const words = org.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
      if (words.length === 0) return;

      const matchedCount = words.filter(w => pdfLower.includes(w)).length;
      const ratio = matchedCount / words.length;
      if (ratio < 0.6) notFound.push(org);
    });

    if (notFound.length === 0) {
      results.push({ field: "Affiliations", status: "match", message: "All affiliations found in PDF" });
    } else if (notFound.length <= Math.ceil(xmlData.affiliations.length / 2)) {
      results.push({ field: "Affiliations", status: "warning", message: `Some affiliations not clearly found in PDF: ${notFound.join(" | ")}` });
    } else {
      results.push({ field: "Affiliations", status: "mismatch", message: `Most affiliations not found in PDF: ${notFound.join(" | ")}` });
    }
  }

  // ── GRANTS ─────────────────────────────────────────────────────────────────
  if (xmlData.grants && xmlData.grants.length > 0) {
    if (!pdfData.grants) {
      results.push({ field: "Grants", status: "warning", message: "Grant information present in XML but could not be extracted from PDF — verify manually" });
    } else {
      results.push({ field: "Grants", status: "match", message: "Grant section found in both XML and PDF" });
    }
  }

  return results;
}

function normalize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pct(score) {
  return Math.round(score * 100);
}

module.exports = compareXMLPDF;
```

- [ ] **Step 2: Quick smoke test — restart backend and upload a file, check comparison results have `status` field**

```bash
cd backend && node -e "const c = require('./engines/comparisonEngine'); console.log(c({title:'hello world', authors:[], references:[], keywords:[], affiliations:[]}, {title:'hello world', fullText:'hello world', references:[], grants:null}));"
```

Expected: array with `{ field: 'Title', status: 'match', ... }`

---

## Task 4: Create User Model

**Files:** `backend/models/User.js`

- [ ] **Step 1: Write the file**

```js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("User", userSchema);
```

---

## Task 5: Create Auth Middleware

**Files:** `backend/middleware/authMiddleware.js`

- [ ] **Step 1: Create the middleware folder and file**

```bash
mkdir -p backend/middleware
```

- [ ] **Step 2: Write `backend/middleware/authMiddleware.js`**

```js
const jwt = require("jsonwebtoken");

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = authMiddleware;
```

---

## Task 6: Create Auth Controller and Routes

**Files:** `backend/controllers/authController.js`, `backend/routes/authRoutes.js`

- [ ] **Step 1: Write `backend/controllers/authController.js`**

```js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

async function register(req, res) {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email and password are required" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  try {
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: "Email already registered" });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed });

    const token = jwt.sign({ id: user._id, name: user.name, email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: "Server error during registration" });
  }
}

async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid email or password" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Invalid email or password" });

    const token = jwt.sign({ id: user._id, name: user.name, email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: "Server error during login" });
  }
}

module.exports = { register, login };
```

- [ ] **Step 2: Write `backend/routes/authRoutes.js`**

```js
const express = require("express");
const { register, login } = require("../controllers/authController");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);

module.exports = router;
```

---

## Task 7: Update server.js

**Files:** `backend/server.js`

- [ ] **Step 1: Replace the entire file**

```js
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const connectDB = require("./config/db");
const uploadRoutes = require("./routes/uploadRoutes");
const aiRoutes = require("./routes/aiRoutes");
const authRoutes = require("./routes/authRoutes");

const app = express();

// Connect to MongoDB
connectDB();

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static("uploads"));

app.use("/api/auth", authRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/ai", aiRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

- [ ] **Step 2: Start the backend and verify**

```bash
cd backend && node server.js
```

Expected output:
```
MongoDB connected
Server running on port 5000
```

If MongoDB is not running locally, start it first: `mongod` (or use MongoDB Atlas — update MONGODB_URI in .env with your Atlas connection string).

---

## Task 8: Create WorkspaceTheme.css

**Files:** `frontend/src/WorkspaceTheme.css`

- [ ] **Step 1: Write the file**

```css
/* ── STYLE B: White + Purple Gradient Theme ── */
:root {
  --primary: #667eea;
  --primary-dark: #764ba2;
  --primary-light: #ede9fe;
  --success: #16a34a;
  --success-bg: #dcfce7;
  --warning: #d97706;
  --warning-bg: #fef3c7;
  --error: #dc2626;
  --error-bg: #fee2e2;
  --info: #0369a1;
  --info-bg: #e0f2fe;
  --border: #e2e8f0;
  --surface: #ffffff;
  --surface-2: #f8fafc;
  --text: #1e293b;
  --text-muted: #64748b;
  --radius: 12px;
  --shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06);
}

/* ── TOPBAR ── */
.wb-topbar {
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
  color: white;
  padding: 12px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 2px 8px rgba(102,126,234,0.4);
}
.wb-topbar-logo { font-size: 16px; font-weight: 700; letter-spacing: 0.3px; }
.wb-topbar-file { font-size: 12px; opacity: 0.8; background: rgba(255,255,255,0.15); padding: 3px 10px; border-radius: 20px; }
.wb-topbar-doi { font-size: 11px; opacity: 0.65; }
.wb-topbar-spacer { flex: 1; }
.wb-issues-badge {
  background: #ef4444;
  color: white;
  font-size: 12px;
  font-weight: 700;
  padding: 3px 11px;
  border-radius: 20px;
  cursor: pointer;
}
.wb-issues-badge.none { background: rgba(255,255,255,0.25); }
.wb-toggle-btn {
  background: rgba(255,255,255,0.2);
  border: none;
  color: white;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
}
.wb-toggle-btn:hover { background: rgba(255,255,255,0.3); }

/* ── ISSUES PANEL ── */
.wb-issues-panel {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  overflow: hidden;
  transition: max-height 0.3s ease;
}
.wb-issues-panel.collapsed { max-height: 48px; }
.wb-issues-panel.expanded { max-height: 600px; }
.wb-issues-header {
  padding: 12px 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid var(--border);
}
.wb-issues-header h3 { font-size: 14px; font-weight: 600; color: var(--text); margin: 0; }
.wb-issues-count-ok { color: var(--success); font-size: 13px; font-weight: 600; }
.wb-issues-count-warn { color: var(--error); font-size: 13px; font-weight: 600; }
.wb-issues-list { padding: 0 20px 12px; }
.wb-issue-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}
.wb-issue-row:last-child { border-bottom: none; }
.wb-issue-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 20px;
  white-space: nowrap;
  margin-top: 1px;
}
.badge-match { background: var(--success-bg); color: var(--success); }
.badge-warning { background: var(--warning-bg); color: var(--warning); }
.badge-mismatch { background: var(--error-bg); color: var(--error); }
.badge-info { background: var(--info-bg); color: var(--info); }
.wb-issue-field { font-weight: 600; font-size: 13px; color: var(--text); min-width: 90px; }
.wb-issue-msg { font-size: 13px; color: var(--text-muted); flex: 1; }
.wb-issue-actions { display: flex; gap: 6px; flex-shrink: 0; }
.btn-jump {
  background: var(--primary-light);
  color: var(--primary-dark);
  border: none;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}
.btn-jump:hover { background: #ddd6fe; }
.btn-ai {
  background: var(--surface-2);
  color: var(--text-muted);
  border: 1px solid var(--border);
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}
.btn-ai:hover { background: var(--border); }
.wb-ai-explanation {
  margin-top: 6px;
  padding: 8px 12px;
  background: var(--info-bg);
  border-radius: 8px;
  font-size: 12px;
  color: var(--info);
  line-height: 1.5;
}

/* ── LAYOUT ── */
.wb-layout {
  display: flex;
  height: calc(100vh - 54px);
  overflow: hidden;
}
.wb-left {
  width: 340px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  background: var(--surface-2);
}
.wb-left-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
}
.wb-left-tab {
  flex: 1;
  padding: 10px;
  text-align: center;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  background: none;
  border-top: none;
  border-left: none;
  border-right: none;
}
.wb-left-tab.active { color: var(--primary); border-bottom-color: var(--primary); }
.wb-left-content { flex: 1; overflow: hidden; }
.wb-iframe { width: 100%; height: 100%; border: none; }
.wb-xml-pre { padding: 12px; font-size: 11px; overflow: auto; height: 100%; margin: 0; background: #1e1e2e; color: #cdd6f4; line-height: 1.5; }

/* ── MAIN PANEL ── */
.wb-main {
  flex: 1;
  overflow-y: auto;
  background: var(--surface-2);
}
.wb-section-tabs {
  display: flex;
  gap: 4px;
  padding: 12px 20px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 10;
  flex-wrap: wrap;
}
.wb-section-tab {
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  position: relative;
  transition: all 0.15s;
}
.wb-section-tab:hover { background: var(--primary-light); color: var(--primary-dark); border-color: var(--primary); }
.wb-section-tab.active { background: var(--primary); color: white; border-color: var(--primary); font-weight: 600; }
.wb-section-tab .tab-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--error);
}
.wb-sections { padding: 20px; display: flex; flex-direction: column; gap: 16px; }

/* ── SECTION CARD ── */
.wb-card {
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
  overflow: hidden;
  transition: box-shadow 0.2s, border-color 0.2s;
}
.wb-card.highlighted {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(102,126,234,0.2), var(--shadow);
  animation: pulse-border 2s ease-out forwards;
}
@keyframes pulse-border {
  0% { box-shadow: 0 0 0 3px rgba(102,126,234,0.4); }
  100% { box-shadow: 0 0 0 3px rgba(102,126,234,0); }
}
.wb-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}
.wb-card-title { font-size: 15px; font-weight: 600; color: var(--text); }
.wb-card-body { padding: 16px 18px; }

/* ── DATA LABELS ── */
.wb-data-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; margin-top: 14px; }
.wb-data-label:first-child { margin-top: 0; }
.wb-data-value { font-size: 14px; color: var(--text); line-height: 1.6; }
.wb-data-pdf { font-size: 13px; color: var(--text-muted); background: var(--surface-2); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); margin-top: 6px; line-height: 1.6; }
.wb-mismatch-text { text-decoration: underline; text-decoration-color: var(--error); text-decoration-style: wavy; color: var(--error); }

/* ── AUTHOR COLOR CODING ── */
.author-initials { color: #dc2626; font-weight: 700; }
.author-given { background: #fef9c3; padding: 1px 4px; border-radius: 3px; color: #854d0e; }
.author-surname { color: #1d4ed8; font-weight: 600; }
.author-orcid { color: #d97706; font-size: 12px; margin-left: 4px; }
.author-email { color: #7c3aed; font-size: 12px; font-style: italic; margin-left: 4px; }
.author-degrees { color: #16a34a; font-size: 12px; margin-left: 4px; }
.author-card { padding: 10px 0; border-bottom: 1px solid var(--border); display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.author-card:last-child { border-bottom: none; }
.author-seq { font-size: 11px; color: var(--text-muted); background: var(--surface-2); border: 1px solid var(--border); padding: 1px 6px; border-radius: 10px; }

/* ── AFFILIATION COLOR CODING ── */
.aff-org { background: #cffafe; color: #164e63; padding: 1px 5px; border-radius: 3px; font-weight: 500; }
.aff-city { background: #fce7f3; color: #831843; padding: 1px 5px; border-radius: 3px; }
.aff-postal { background: #dcfce7; color: #14532d; padding: 1px 5px; border-radius: 3px; }
.aff-country { background: #fef3c7; color: #92400e; padding: 1px 5px; border-radius: 3px; }
.aff-card { padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px; line-height: 2; }
.aff-card:last-child { border-bottom: none; }
.aff-source { font-size: 11px; color: var(--text-muted); margin-top: 4px; }

/* ── KEYWORD CHIPS ── */
.kw-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.kw-chip { padding: 4px 12px; border-radius: 20px; font-size: 13px; border: 1px solid var(--border); background: var(--primary-light); color: var(--primary-dark); font-weight: 500; }
.kw-chip.missing { background: var(--error-bg); color: var(--error); border-color: #fca5a5; }

/* ── REFERENCE LIST ── */
.ref-item { font-size: 13px; color: var(--text); padding: 8px 0; border-bottom: 1px solid var(--border); line-height: 1.5; }
.ref-item:last-child { border-bottom: none; }
.ref-seq { color: var(--primary); font-weight: 700; margin-right: 6px; }

/* ── FLOATING AI CHAT ── */
.ai-fab {
  position: fixed;
  bottom: 28px;
  right: 28px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), var(--primary-dark));
  color: white;
  border: none;
  font-size: 22px;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(102,126,234,0.5);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s;
}
.ai-fab:hover { transform: scale(1.08); }
.ai-drawer {
  position: fixed;
  bottom: 92px;
  right: 28px;
  width: 360px;
  background: var(--surface);
  border-radius: 16px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.18);
  border: 1px solid var(--border);
  z-index: 200;
  overflow: hidden;
  animation: slide-up 0.2s ease-out;
}
@keyframes slide-up {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
.ai-drawer-header {
  background: linear-gradient(135deg, var(--primary), var(--primary-dark));
  color: white;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ai-drawer-header h4 { margin: 0; font-size: 14px; }
.ai-drawer-close { background: none; border: none; color: white; font-size: 18px; cursor: pointer; padding: 0; line-height: 1; }
.ai-drawer-body { padding: 14px; }
.ai-drawer-answer { background: var(--surface-2); border-radius: 8px; padding: 10px 12px; font-size: 13px; color: var(--text); margin-bottom: 10px; line-height: 1.6; min-height: 60px; }
.ai-drawer-input-row { display: flex; gap: 8px; }
.ai-drawer-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 13px;
  outline: none;
}
.ai-drawer-input:focus { border-color: var(--primary); }
.ai-drawer-send {
  background: var(--primary);
  color: white;
  border: none;
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}
.ai-drawer-send:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── LOGIN / REGISTER PAGES ── */
.auth-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.auth-card {
  background: white;
  border-radius: 20px;
  padding: 40px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.2);
}
.auth-logo { text-align: center; margin-bottom: 28px; }
.auth-logo h2 { font-size: 22px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
.auth-logo p { font-size: 14px; color: var(--text-muted); }
.auth-field { margin-bottom: 18px; }
.auth-field label { display: block; font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 6px; }
.auth-field input {
  width: 100%;
  padding: 11px 14px;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}
.auth-field input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(102,126,234,0.15); }
.auth-btn {
  width: 100%;
  padding: 13px;
  background: linear-gradient(135deg, var(--primary), var(--primary-dark));
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 6px;
  transition: opacity 0.15s;
}
.auth-btn:hover { opacity: 0.9; }
.auth-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.auth-error { background: var(--error-bg); color: var(--error); padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; }
.auth-link { text-align: center; margin-top: 20px; font-size: 13px; color: var(--text-muted); }
.auth-link a { color: var(--primary); font-weight: 600; text-decoration: none; }
.auth-link a:hover { text-decoration: underline; }
```

---

## Task 9: Create LoginPage.jsx

**Files:** `frontend/src/pages/LoginPage.jsx`

- [ ] **Step 1: Write the file**

```jsx
import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "../WorkspaceTheme.css";

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("http://localhost:5000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      navigate("/");
    } catch {
      setError("Unable to connect to server. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <h2>CAR Proofreader</h2>
          <p>Sign in to your account</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label>Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="auth-field">
            <label>Password</label>
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="auth-link">
          Don't have an account? <Link to="/register">Register</Link>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
```

---

## Task 10: Create RegisterPage.jsx

**Files:** `frontend/src/pages/RegisterPage.jsx`

- [ ] **Step 1: Write the file**

```jsx
import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "../WorkspaceTheme.css";

function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("http://localhost:5000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Registration failed");
        return;
      }

      navigate("/login");
    } catch {
      setError("Unable to connect to server. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <h2>CAR Proofreader</h2>
          <p>Create your account</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label>Full Name</label>
            <input
              type="text"
              placeholder="John Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="auth-field">
            <label>Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="auth-field">
            <label>Password</label>
            <input
              type="password"
              placeholder="Min. 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="auth-field">
            <label>Confirm Password</label>
            <input
              type="password"
              placeholder="Repeat your password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>

          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <div className="auth-link">
          Already have an account? <Link to="/login">Sign In</Link>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;
```

---

## Task 11: Update App.js (Protected Routes)

**Files:** `frontend/src/App.js`

- [ ] **Step 1: Replace the entire file**

```jsx
import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";

function ProtectedRoute({ children }) {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
```

---

## Task 12: Rewrite AIChat.jsx (Floating Drawer)

**Files:** `frontend/src/components/AIChat.jsx`

- [ ] **Step 1: Replace the entire file**

```jsx
import React, { useState } from "react";
import "../WorkspaceTheme.css";

function AIChat() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  const askAI = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setAnswer("");

    try {
      const res = await fetch("http://localhost:5000/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      setAnswer(data.answer || "No answer returned.");
    } catch {
      setAnswer("Failed to reach AI. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !loading) askAI();
  };

  return (
    <>
      {open && (
        <div className="ai-drawer">
          <div className="ai-drawer-header">
            <h4>🤖 AI Assistant (CAR Manual)</h4>
            <button className="ai-drawer-close" onClick={() => setOpen(false)}>✕</button>
          </div>
          <div className="ai-drawer-body">
            <div className="ai-drawer-answer">
              {loading ? "Thinking..." : answer || "Ask me anything about CAR proofreading rules."}
            </div>
            <div className="ai-drawer-input-row">
              <input
                className="ai-drawer-input"
                type="text"
                placeholder="e.g. Is department allowed as organization?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleKey}
              />
              <button className="ai-drawer-send" onClick={askAI} disabled={loading}>
                {loading ? "..." : "Ask"}
              </button>
            </div>
          </div>
        </div>
      )}
      <button className="ai-fab" onClick={() => setOpen((v) => !v)} title="AI Assistant">
        🤖
      </button>
    </>
  );
}

export default AIChat;
```

---

## Task 13: Rewrite ErrorPanel.jsx

**Files:** `frontend/src/components/ErrorPanel.jsx`

- [ ] **Step 1: Replace the entire file**

```jsx
import React, { useState } from "react";
import "../WorkspaceTheme.css";

function ErrorPanel({ comparison = [], xml, pdf, onJump }) {
  const [collapsed, setCollapsed] = useState(false);
  const [loadingIndex, setLoadingIndex] = useState(null);
  const [aiExplanations, setAiExplanations] = useState({});

  const issues = comparison.filter((c) => c.status === "warning" || c.status === "mismatch");
  const infos = comparison.filter((c) => c.status === "info");
  const hasIssues = issues.length > 0;

  const askExplanation = async (item, index) => {
    setLoadingIndex(index);
    try {
      const res = await fetch("http://localhost:5000/api/ai/explain-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comparisonItem: item,
          xmlTitle: xml?.title || "",
          pdfTitle: pdf?.title || "",
          xmlAbstract: xml?.abstract || "",
          pdfAbstract: pdf?.abstract || "",
          xmlReferenceCount: xml?.references?.length || 0,
          pdfReferenceCount: pdf?.references?.length || 0,
        }),
      });
      const data = await res.json();
      setAiExplanations((prev) => ({ ...prev, [index]: data.explanation || "No explanation returned." }));
    } catch {
      setAiExplanations((prev) => ({ ...prev, [index]: "Failed to get AI explanation." }));
    } finally {
      setLoadingIndex(null);
    }
  };

  const statusBadgeClass = (status) => {
    if (status === "match") return "badge-match";
    if (status === "warning") return "badge-warning";
    if (status === "mismatch") return "badge-mismatch";
    return "badge-info";
  };

  const statusLabel = (status) => {
    if (status === "match") return "✓ Match";
    if (status === "warning") return "⚠ Warning";
    if (status === "mismatch") return "✗ Mismatch";
    return "ℹ Info";
  };

  return (
    <div className={`wb-issues-panel ${collapsed ? "collapsed" : "expanded"}`}>
      <div className="wb-issues-header" onClick={() => setCollapsed((v) => !v)}>
        <h3>Validation Results</h3>
        {hasIssues ? (
          <span className="wb-issues-count-warn">
            {issues.length} issue{issues.length !== 1 ? "s" : ""} found
          </span>
        ) : (
          <span className="wb-issues-count-ok">✓ All checks passed</span>
        )}
        <span style={{ marginLeft: "auto", color: "var(--text-muted)", fontSize: 13 }}>
          {collapsed ? "▼ Show" : "▲ Hide"}
        </span>
      </div>

      {!collapsed && (
        <div className="wb-issues-list">
          {/* Info rows (references count) */}
          {infos.map((item, i) => (
            <div key={`info-${i}`} className="wb-issue-row">
              <span className={`wb-issue-badge badge-info`}>{statusLabel("info")}</span>
              <span className="wb-issue-field">{item.field}</span>
              <span className="wb-issue-msg">{item.message}</span>
            </div>
          ))}

          {/* Issue rows */}
          {issues.map((item, index) => (
            <div key={index} style={{ borderBottom: "1px solid var(--border)", paddingBottom: 10, marginBottom: 10 }}>
              <div className="wb-issue-row" style={{ borderBottom: "none", paddingBottom: 0, marginBottom: 0 }}>
                <span className={`wb-issue-badge ${statusBadgeClass(item.status)}`}>
                  {statusLabel(item.status)}
                </span>
                <span className="wb-issue-field">{item.field}</span>
                <span className="wb-issue-msg">{item.message}</span>
                <div className="wb-issue-actions">
                  <button className="btn-jump" onClick={() => onJump && onJump(item.field)}>
                    ↗ Jump
                  </button>
                  <button
                    className="btn-ai"
                    onClick={() => askExplanation(item, index)}
                    disabled={loadingIndex === index}
                  >
                    {loadingIndex === index ? "..." : "AI Explain"}
                  </button>
                </div>
              </div>
              {aiExplanations[index] && (
                <div className="wb-ai-explanation">{aiExplanations[index]}</div>
              )}
            </div>
          ))}

          {comparison.length === 0 && (
            <p style={{ color: "var(--text-muted)", fontSize: 13, padding: "8px 0" }}>
              Upload files to see validation results.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default ErrorPanel;
```

---

## Task 14: Rewrite ProofreadingWorkspace.jsx

**Files:** `frontend/src/components/ProofreadingWorkspace.jsx`

- [ ] **Step 1: Replace the entire file**

```jsx
import React, { useMemo, useState, useRef, useCallback } from "react";
import "../WorkspaceTheme.css";
import ErrorPanel from "./ErrorPanel";
import AIChat from "./AIChat";

const SECTIONS = [
  { key: "title",          label: "Title" },
  { key: "authors",        label: "Authors" },
  { key: "affiliations",   label: "Affiliations" },
  { key: "correspondence", label: "Correspondence" },
  { key: "abstract",       label: "Abstract" },
  { key: "keywords",       label: "Keywords" },
  { key: "references",     label: "References" },
  { key: "grants",         label: "Grants" },
];

function StatusBadge({ status }) {
  const cls = `wb-issue-badge badge-${status}`;
  const label = { match: "✓ Match", warning: "⚠ Warning", mismatch: "✗ Mismatch", info: "ℹ Info" }[status] || status;
  return <span className={cls}>{label}</span>;
}

function ProofreadingWorkspace({ data }) {
  const [leftOpen, setLeftOpen]         = useState(true);
  const [previewTab, setPreviewTab]     = useState("pdf");
  const [activeSection, setActiveSection] = useState("title");
  const [highlightedSection, setHighlightedSection] = useState(null);

  const xml        = data?.xml        || {};
  const pdf        = data?.pdf        || {};
  const comparison = data?.comparison || [];

  const sectionRefs = useRef({});
  SECTIONS.forEach(({ key }) => {
    if (!sectionRefs.current[key]) sectionRefs.current[key] = React.createRef();
  });

  const pdfUrl = useMemo(() => {
    const path = data?.files?.pdfPath;
    return path ? `http://localhost:5000/${path}` : null;
  }, [data]);

  const xmlPretty = useMemo(() => {
    try { return JSON.stringify(xml?.raw || xml, null, 2); }
    catch { return "No XML preview available"; }
  }, [xml]);

  const issuesForSection = useCallback((sectionLabel) =>
    comparison.filter(c =>
      (c.status === "warning" || c.status === "mismatch") &&
      c.field.toLowerCase() === sectionLabel.toLowerCase()
    ), [comparison]);

  const getStatusForSection = useCallback((sectionLabel) => {
    const c = comparison.find(r => r.field.toLowerCase() === sectionLabel.toLowerCase());
    return c?.status || null;
  }, [comparison]);

  const handleJump = useCallback((fieldName) => {
    const match = SECTIONS.find(s => s.label.toLowerCase() === fieldName.toLowerCase());
    const key = match?.key || fieldName.toLowerCase();
    const ref = sectionRefs.current[key];
    if (ref?.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(key);
      setHighlightedSection(key);
      setTimeout(() => setHighlightedSection(null), 2500);
    }
  }, []);

  const scrollTo = (key) => {
    setActiveSection(key);
    sectionRefs.current[key]?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/login";
  };

  const issueCount = comparison.filter(c => c.status === "warning" || c.status === "mismatch").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

      {/* TOP BAR */}
      <div className="wb-topbar">
        <span className="wb-topbar-logo">CAR Proofreader</span>
        {data?.files?.xmlPath && (
          <span className="wb-topbar-file">
            {data.files.xmlPath.split(/[\\/]/).pop()}
          </span>
        )}
        {xml?.pages?.doi && (
          <span className="wb-topbar-doi">DOI: {xml.pages.doi}</span>
        )}
        <span className="wb-topbar-spacer" />
        <span
          className={`wb-issues-badge ${issueCount === 0 ? "none" : ""}`}
          onClick={() => document.querySelector(".wb-issues-panel")?.scrollIntoView({ behavior: "smooth" })}
        >
          {issueCount === 0 ? "✓ No Issues" : `${issueCount} Issue${issueCount !== 1 ? "s" : ""}`}
        </span>
        <span style={{ fontSize: 13, opacity: 0.8, marginLeft: 8 }}>
          {user.name}
        </span>
        <button className="wb-toggle-btn" onClick={logout} title="Logout">
          ⎋ Logout
        </button>
        <button className="wb-toggle-btn" onClick={() => setLeftOpen(v => !v)}>
          {leftOpen ? "◀ Hide" : "▶ Preview"}
        </button>
      </div>

      {/* ISSUES PANEL */}
      <ErrorPanel comparison={comparison} xml={xml} pdf={pdf} onJump={handleJump} />

      {/* LAYOUT */}
      <div className="wb-layout" style={{ flex: 1, overflow: "hidden" }}>

        {/* LEFT PANE */}
        {leftOpen && (
          <div className="wb-left">
            <div className="wb-left-tabs">
              <button
                className={`wb-left-tab ${previewTab === "pdf" ? "active" : ""}`}
                onClick={() => setPreviewTab("pdf")}
              >PDF</button>
              <button
                className={`wb-left-tab ${previewTab === "xml" ? "active" : ""}`}
                onClick={() => setPreviewTab("xml")}
              >XML Source</button>
            </div>
            <div className="wb-left-content">
              {previewTab === "pdf" ? (
                pdfUrl
                  ? <iframe title="PDF" src={pdfUrl} className="wb-iframe" />
                  : <div style={{ padding: 20, color: "var(--text-muted)", fontSize: 13 }}>No PDF loaded</div>
              ) : (
                <pre className="wb-xml-pre">{xmlPretty}</pre>
              )}
            </div>
          </div>
        )}

        {/* MAIN PANE */}
        <div className="wb-main">
          {/* Section Tabs */}
          <div className="wb-section-tabs">
            {SECTIONS.map(({ key, label }) => {
              const status = getStatusForSection(label);
              const hasIssue = status === "warning" || status === "mismatch";
              return (
                <button
                  key={key}
                  className={`wb-section-tab ${activeSection === key ? "active" : ""}`}
                  onClick={() => scrollTo(key)}
                >
                  {label}
                  {hasIssue && <span className="tab-dot" />}
                </button>
              );
            })}
          </div>

          {/* Section Cards */}
          <div className="wb-sections">

            {/* TITLE */}
            <div ref={sectionRefs.current.title} className={`wb-card ${highlightedSection === "title" ? "highlighted" : ""}`}>
              <div className="wb-card-header">
                <span className="wb-card-title">Title</span>
                {getStatusForSection("Title") && <StatusBadge status={getStatusForSection("Title")} />}
              </div>
              <div className="wb-card-body">
                <div className="wb-data-label">XML Title</div>
                <div className="wb-data-value">{xml.title || <em style={{color:"var(--text-muted)"}}>Not found</em>}</div>
                {pdf.title && (
                  <>
                    <div className="wb-data-label">PDF Title</div>
                    <div className="wb-data-pdf">{pdf.title}</div>
                  </>
                )}
              </div>
            </div>

            {/* AUTHORS */}
            <div ref={sectionRefs.current.authors} className={`wb-card ${highlightedSection === "authors" ? "highlighted" : ""}`}>
              <div className="wb-card-header">
                <span className="wb-card-title">Authors</span>
                {getStatusForSection("Authors") && <StatusBadge status={getStatusForSection("Authors")} />}
              </div>
              <div className="wb-card-body">
                {(xml.authors || []).length === 0
                  ? <em style={{color:"var(--text-muted)", fontSize:13}}>No authors found</em>
                  : (xml.authors || []).map((a, i) => (
                    <div key={i} className="author-card">
                      {a.seq && <span className="author-seq">#{a.seq}</span>}
                      {a.initials && <span className="author-initials">{a.initials}</span>}
                      {a.givenName && <span className="author-given">{a.givenName}</span>}
                      {a.surname && <span className="author-surname">{a.surname}</span>}
                      {a.degrees && <span className="author-degrees">{a.degrees}</span>}
                      {a.orcid && <span className="author-orcid">ORCID: {a.orcid}</span>}
                      {a.email && <span className="author-email">{a.email}</span>}
                    </div>
                  ))
                }
              </div>
            </div>

            {/* AFFILIATIONS */}
            <div ref={sectionRefs.current.affiliations} className={`wb-card ${highlightedSection === "affiliations" ? "highlighted" : ""}`}>
              <div className="wb-card-header">
                <span className="wb-card-title">Affiliations</span>
                {getStatusForSection("Affiliations") && <StatusBadge status={getStatusForSection("Affiliations")} />}
              </div>
              <div className="wb-card-body">
                {(xml.affiliations || []).length === 0
                  ? <em style={{color:"var(--text-muted)", fontSize:13}}>No affiliations found</em>
                  : (xml.affiliations || []).map((aff, i) => (
                    <div key={i} className="aff-card">
                      {aff.organization && <span className="aff-org">{aff.organization}</span>}
                      {aff.address && <> · {aff.address}</>}
                      {aff.city && <> · <span className="aff-city">{aff.city}</span></>}
                      {aff.state && <>, {aff.state}</>}
                      {aff.postalCode && <> <span className="aff-postal">{aff.postalCode}</span></>}
                      {aff.country && <> · <span className="aff-country">{aff.country}</span></>}
                      {aff.sourceText && <div className="aff-source">Source: {aff.sourceText}</div>}
                    </div>
                  ))
                }
              </div>
            </div>

            {/* CORRESPONDENCE */}
            <div ref={sectionRefs.current.correspondence} className={`wb-card ${highlightedSection === "correspondence" ? "highlighted" : ""}`}>
              <div className="wb-card-header">
                <span className="wb-card-title">Correspondence</span>
              </div>
              <div className="wb-card-body">
                {(xml.correspondence || []).length === 0
                  ? <em style={{color:"var(--text-muted)", fontSize:13}}>No correspondence found</em>
                  : (xml.correspondence || []).map((c, i) => (
                    <div key={i} className="author-card">
                      {c.initials && <span className="author-initials">{c.initials}</span>}
                      {c.givenName && <span className="author-given">{c.givenName}</span>}
                      {c.surname && <span className="author-surname">{c.surname}</span>}
                      {c.email && <span className="author-email">✉ {c.email}</span>}
                    </div>
                  ))
                }
              </div>
            </div>

            {/* ABSTRACT */}
            <div ref={sectionRefs.current.abstract} className={`wb-card ${highlightedSection === "abstract" ? "highlighted" : ""}`}>
              <div className="wb-card-header">
                <span className="wb-card-title">Abstract</span>
                {getStatusForSection("Abstract") && <StatusBadge status={getStatusForSection("Abstract")} />}
              </div>
              <div className="wb-card-body">
                <div className="wb-data-label">XML Abstract</div>
                <div className="wb-data-value" style={{fontSize:13, lineHeight:1.7}}>
                  {xml.abstract || <em style={{color:"var(--text-muted)"}}>Not found</em>}
                </div>
                {pdf.abstract && (
                  <>
                    <div className="wb-data-label">PDF Abstract</div>
                    <div className="wb-data-pdf" style={{fontSize:13, lineHeight:1.7}}>{pdf.abstract}</div>
                  </>
                )}
              </div>
            </div>

            {/* KEYWORDS */}
            <div ref={sectionRefs.current.keywords} className={`wb-card ${highlightedSection === "keywords" ? "highlighted" : ""}`}>
              <div className="wb-card-header">
                <span className="wb-card-title">Keywords</span>
                {getStatusForSection("Keywords") && <StatusBadge status={getStatusForSection("Keywords")} />}
              </div>
              <div className="wb-card-body">
                <div className="wb-data-label">XML Keywords</div>
                <div className="kw-chips">
                  {(xml.keywords || []).length === 0
                    ? <em style={{color:"var(--text-muted)", fontSize:13}}>None found</em>
                    : (xml.keywords || []).map((kw, i) => {
                        const inPdf = pdf.fullText && pdf.fullText.toLowerCase().includes(kw.toLowerCase());
                        return (
                          <span key={i} className={`kw-chip ${!inPdf && pdf.fullText ? "missing" : ""}`}>
                            {kw}
                          </span>
                        );
                      })
                  }
                </div>
                {(pdf.keywords || []).length > 0 && (
                  <>
                    <div className="wb-data-label">PDF Keywords</div>
                    <div className="kw-chips">
                      {pdf.keywords.map((kw, i) => <span key={i} className="kw-chip" style={{background:"var(--surface-2)"}}>{kw}</span>)}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* REFERENCES */}
            <div ref={sectionRefs.current.references} className={`wb-card ${highlightedSection === "references" ? "highlighted" : ""}`}>
              <div className="wb-card-header">
                <span className="wb-card-title">References</span>
                <span className="wb-issue-badge badge-info" style={{marginLeft:8}}>
                  XML: {(xml.references || []).length} | PDF: {(pdf.references || []).length}
                </span>
              </div>
              <div className="wb-card-body">
                <div className="wb-data-label">XML References ({(xml.references || []).length})</div>
                {(xml.references || []).slice(0, 10).map((ref, i) => (
                  <div key={i} className="ref-item">
                    <span className="ref-seq">[{ref.seq || i + 1}]</span>
                    {ref.displayText || ref.fullText || ref.sourceText || `${ref.authors?.map(a => a.surname).join(", ")} (${ref.publicationYear})`}
                  </div>
                ))}
                {(xml.references || []).length > 10 && (
                  <div style={{fontSize:12, color:"var(--text-muted)", marginTop:8}}>
                    ...and {xml.references.length - 10} more references
                  </div>
                )}
              </div>
            </div>

            {/* GRANTS */}
            <div ref={sectionRefs.current.grants} className={`wb-card ${highlightedSection === "grants" ? "highlighted" : ""}`}>
              <div className="wb-card-header">
                <span className="wb-card-title">Grants</span>
                {getStatusForSection("Grants") && <StatusBadge status={getStatusForSection("Grants")} />}
              </div>
              <div className="wb-card-body">
                {(xml.grants || []).length === 0
                  ? <em style={{color:"var(--text-muted)", fontSize:13}}>No grants found</em>
                  : (xml.grants || []).map((g, i) => (
                    <div key={i} style={{padding:"8px 0", borderBottom:"1px solid var(--border)", fontSize:13}}>
                      {g.grantText
                        ? <span>{g.grantText}</span>
                        : <>
                            {g.agency && <span className="aff-org">{g.agency}</span>}
                            {g.grantId && <> · Grant ID: <strong>{g.grantId}</strong></>}
                            {g.country && <> · <span className="aff-country">{g.country}</span></>}
                          </>
                      }
                    </div>
                  ))
                }
                {pdf.grants && (
                  <>
                    <div className="wb-data-label" style={{marginTop:12}}>PDF Grant Text</div>
                    <div className="wb-data-pdf" style={{fontSize:13}}>{pdf.grants}</div>
                  </>
                )}
              </div>
            </div>

          </div>{/* end wb-sections */}
        </div>{/* end wb-main */}
      </div>{/* end wb-layout */}

      <AIChat />
    </div>
  );
}

export default ProofreadingWorkspace;
```

---

## Task 15: End-to-End Verification

- [ ] **Step 1: Start backend**

```bash
cd backend && node server.js
```

Expected: `MongoDB connected` + `Server running on port 5000`

- [ ] **Step 2: Start frontend**

```bash
cd frontend && npm start
```

Expected: Opens browser at `http://localhost:3000` and redirects to `/login`

- [ ] **Step 3: Register a test account**

Go to `http://localhost:3000/register` — enter name, email, password, submit. Should redirect to login.

- [ ] **Step 4: Login**

Enter the same credentials. Should redirect to Dashboard.

- [ ] **Step 5: Upload XML + PDF**

Upload a real XML and PDF file. Verify:
- Comparison results appear in Issues Panel at top
- Each section card shows color-coded data
- Keywords show green/red chips depending on whether they're in PDF
- "↗ Jump" button scrolls to the correct section with blue border highlight
- "AI Explain" button returns an explanation
- Floating 🤖 button opens the AI chat drawer
- Logout button works

- [ ] **Step 6: Verify no false positives on a known-good file pair**

Upload a file where XML and PDF genuinely match. Confirm Issues Panel shows "✓ All checks passed".
