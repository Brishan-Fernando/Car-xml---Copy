# CAR XML Proofreading System — Redesign Spec
**Date:** 2026-04-13
**Approach:** Approach 2 — Fix Comparison Engine + UI Redesign + Auth

---

## 1. Goals

1. Eliminate false positives in XML vs PDF comparison (biggest issue for viva/marks)
2. Redesign UI to Style B (white + purple gradient, clean, professional)
3. Add Login/Register system with JWT + MongoDB
4. Add click-to-jump from issue to section
5. Add inline mismatch highlighting per section
6. Keep AI chatbot and "Explain with AI" fully working

---

## 2. Scope

**Backend changes:**
- `comparisonEngine.js` — full rewrite with fuzzy matching
- New `authRoutes.js` + `authController.js` — register/login endpoints
- New `User.js` model — MongoDB user schema
- New `authMiddleware.js` — JWT verification middleware
- Upload route protected by auth middleware
- Install: `string-similarity`, `bcryptjs`, `jsonwebtoken`

**Frontend changes:**
- `ProofreadingWorkspace.jsx` — full rewrite (Style B layout)
- `ErrorPanel.jsx` — moved to top, shows only warnings/mismatches
- `AIChat.jsx` — refactored to floating drawer
- New `LoginPage.jsx` — login form
- New `RegisterPage.jsx` — registration form
- `App.js` — add protected routes
- New `WorkspaceTheme.css` — Style B design tokens

**No changes to:**
- `xmlParserEngine.js`
- `pdfParserEngine.js`
- `aiEngine.js`
- `uploadRoutes.js` (except adding auth middleware)
- `aiRoutes.js`
- `Dashboard.js`
- `FileUploadComponent.js`

---

## 3. Comparison Engine — Fuzzy Matching

Replaces `backend/engines/comparisonEngine.js`. Same export signature:
`compareXMLPDF(xmlData, pdfData) → Array<ComparisonResult>`

### Result shape
```js
{
  field: string,           // "Title" | "Author" | "Abstract" | etc.
  status: "match" | "warning" | "mismatch" | "info",
  message: string,         // human-readable explanation
  xml: string,             // XML value (for display)
  pdf: string,             // PDF value (for display)
}
```

### Per-field logic

**Title**
- Normalize both: lowercase, collapse whitespace, strip punctuation
- Compute Jaro-Winkler similarity (via `string-similarity` package)
- ≥ 0.92 → `match`
- 0.75–0.91 → `warning` ("Titles are similar but differ slightly")
- < 0.75 → `mismatch`

**Authors**
- For each XML author, build 5 candidate formats:
  - "John Smith", "Smith John", "Smith J.", "J. Smith", "Smith JD"
- Search PDF fullText (case-insensitive) for any candidate
- All found → `match`
- Some not found → `warning` ("Some authors not clearly found in PDF")
- None found → `mismatch`

**References**
- Always `info` — never an error
- Message: "XML has {n} references | PDF extracted {m} — PDF count may be incomplete"
- Reason: PDF reference parsing is inherently unreliable; count difference is expected

**Affiliations**
- For each XML affiliation's organization name:
  - Split into meaningful words (skip: "of", "the", "and", "for", "a")
  - If ≥ 60% of words found in PDF fullText → pass
- All pass → `match`
- Some fail → `warning`
- Most fail → `mismatch`

**Abstract**
- Normalize both (lowercase, collapse whitespace, strip punctuation)
- Compare first 400 characters
- Jaro-Winkler ≥ 0.85 → `match`
- 0.70–0.84 → `warning`
- < 0.70 → `mismatch`

**Keywords**
- For each XML keyword: check if found in PDF fullText (case-insensitive, trimmed)
- All found → `match`
- Some missing → `warning`

**Grants**
- If XML has grants and PDF has no grant text → `warning` (not mismatch — PDF grant parsing is unreliable)
- If XML has no grants → skip entirely

---

## 4. UI Design — Style B

### Layout structure
```
┌─────────────────────────────────────────────────────┐
│  TOP BAR (purple gradient)                          │
│  Logo | filename | DOI | [issues badge]             │
├─────────────────────────────────────────────────────┤
│  ISSUES PANEL (top, collapsible)                    │
│  "3 issues found" | [Jump] [Explain AI] per issue   │
├───────────────────┬─────────────────────────────────┤
│  LEFT PANEL       │  SECTION TABS                   │
│  (toggleable)     │  Title|Authors|Affiliations|...  │
│                   ├─────────────────────────────────┤
│  [PDF Viewer]     │  SECTION CARDS (scrollable)     │
│  [XML Source]     │  Each card: status badge +      │
│                   │  color-coded XML data +         │
│                   │  PDF value + mismatch highlight │
└───────────────────┴─────────────────────────────────┘
                              [💬 AI Chat button]
```

### Top bar
- Background: `linear-gradient(135deg, #667eea, #764ba2)`
- White text, shows: `CAR Proofreader | {filename} | DOI: {doi}`
- Right side: red badge showing count of warnings+mismatches
- Toggle button for left panel

### Issues Panel
- Positioned below top bar, above section tabs
- Background: white, left border accent per status
- Shows only `warning` and `mismatch` results
- Each row: field name | message | **[Jump]** button | **[Explain with AI]** button
- If no issues: shows green bar "✓ All checks passed"
- Collapsible (click to hide/show)

### Section tabs
- Horizontal pill tabs: Title | Authors | Affiliations | Correspondence | Abstract | Keywords | References | Grants
- Active tab: purple underline
- Tabs with issues: show small red dot indicator

### Section cards
- White card, `border-radius: 12px`, subtle shadow
- Header: section name + status badge (✓ green / ⚠ yellow / ✗ red)
- XML data displayed with color coding:
  - Initials → `color: #dc2626` (red)
  - Given name → `background: #fef9c3` (yellow highlight)
  - Surname → `color: #1d4ed8` (blue, bold)
  - ORCID → `color: #d97706` (orange)
  - Organization → `background: #cffafe` (cyan)
  - City → `background: #fce7f3` (pink)
  - Postal code → `background: #dcfce7` (green)
- PDF extracted value shown below in grey box
- Mismatching words underlined in red

### AI Chat (floating drawer)
- Floating button: bottom-right, purple, `💬` icon
- Click opens slide-up drawer (400px height)
- Same API call to `/api/ai/ask`
- Close button top-right of drawer

---

## 5. Authentication System

### Backend

**User model** (`backend/models/User.js`)
```
name: String (required)
email: String (required, unique)
password: String (hashed with bcrypt, rounds: 10)
createdAt: Date (default: now)
```

**Endpoints** (`backend/routes/authRoutes.js`)
- `POST /api/auth/register` → validates, hashes password, creates user, returns JWT
- `POST /api/auth/login` → validates credentials, returns JWT
- JWT secret from `.env` as `JWT_SECRET`
- Token expiry: 7 days

**Middleware** (`backend/middleware/authMiddleware.js`)
- Reads `Authorization: Bearer <token>` header
- Verifies JWT, attaches `req.user` to request
- Applied to `POST /api/upload/files`

### Frontend

**LoginPage.jsx**
- White card centered on purple gradient background
- Fields: Email, Password
- "Login" button → POST `/api/auth/login` → store token in localStorage → redirect to Dashboard
- Link to Register page
- Show error message on invalid credentials

**RegisterPage.jsx**
- Same style as Login
- Fields: Name, Email, Password, Confirm Password
- Client-side validation (passwords match, email format)
- On success → redirect to Login

**Protected routes** (`App.js`)
- If no token in localStorage → redirect to `/login`
- Routes: `/login`, `/register` (public) | `/` (protected)

---

## 6. Data Flow (unchanged for parsing)

```
[Login] → JWT stored
    ↓
[FileUploadComponent] → POST /api/upload/files (with Auth header)
    ↓
[uploadRoutes.js] → xmlParserEngine + pdfParserEngine (unchanged)
    ↓
[comparisonEngine.js] → fuzzy comparison → results array
    ↓
[Dashboard.js] → passes results to ProofreadingWorkspace
    ↓
[ProofreadingWorkspace.jsx] → renders UI
    ├── ErrorPanel (top) → issues list with Jump + AI Explain
    ├── Section tabs → scroll to section ref
    └── Section cards → color-coded data + mismatch highlights
```

---

## 7. Click-to-Jump Implementation

- Each section card has a React `ref`: `titleRef`, `authorsRef`, etc.
- `ProofreadingWorkspace` maintains `highlightedSection` state
- ErrorPanel "Jump" button calls `onJump("Authors")` callback
- Workspace scrolls: `authorsRef.current.scrollIntoView({ behavior: 'smooth' })`
- Highlighted section gets CSS class `section-highlighted` (pulse animation, blue border) for 2 seconds then clears

---

## 8. npm Packages to Install

**Backend:**
- `string-similarity` — Jaro-Winkler / dice coefficient scoring
- `bcryptjs` — password hashing
- `jsonwebtoken` — JWT create/verify

**Frontend:**
- No new packages needed

---

## 9. Files Summary

| File | Action |
|------|--------|
| `backend/engines/comparisonEngine.js` | Full rewrite |
| `backend/routes/authRoutes.js` | New |
| `backend/controllers/authController.js` | New |
| `backend/models/User.js` | New |
| `backend/middleware/authMiddleware.js` | New |
| `backend/server.js` | Add auth route + middleware |
| `frontend/src/components/ProofreadingWorkspace.jsx` | Full rewrite |
| `frontend/src/components/ErrorPanel.jsx` | Updated |
| `frontend/src/components/AIChat.jsx` | Floating drawer |
| `frontend/src/pages/LoginPage.jsx` | New |
| `frontend/src/pages/RegisterPage.jsx` | New |
| `frontend/src/App.js` | Add protected routes |
| `frontend/src/WorkspaceTheme.css` | New |

---

## 10. Out of Scope

- Changes to XML parser engine
- Changes to PDF parser engine
- Changes to AI engine
- New API endpoints beyond auth
- Database storage of comparison results
- Multi-language support
