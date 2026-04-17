# CAR XML Proofreading System — CLAUDE.md

## Project Overview

A full-stack web application for proofreading Elsevier CAR (Cardiovascular Research) XML files against their corresponding PDFs. Proofreaders upload an XML + PDF pair, the system parses both, runs a comparison, and displays the results in a structured workspace with an AI assistant (Gemini) for CAR-rules questions.

## Architecture

```
project root/
├── frontend/          React 18 app (CRA, port 3000)
│   └── src/
│       ├── App.js                    — Router: /, /login, /register
│       ├── pages/
│       │   ├── Dashboard.js          — Upload screen → ProofreadingWorkspace switch
│       │   ├── LoginPage.jsx
│       │   └── RegisterPage.jsx
│       ├── components/
│       │   ├── FileUploadComponent.js      — Drag-and-drop XML + PDF upload
│       │   ├── ProofreadingWorkspace.jsx   — Main workspace (full-screen after upload)
│       │   ├── ErrorPanel.jsx              — Issues panel with AI-explain per issue
│       │   ├── AbstractDiffView.jsx        — Word-level XML vs PDF abstract diff
│       │   ├── ReferenceSpacingChecker.jsx — Per-reference spacing/format linter
│       │   ├── AIChat.jsx                  — Floating AI chatbot drawer (Gemini)
│       │   └── ResultViewer.jsx            — OLD viewer, not used in main flow
│       ├── utils/
│       │   └── xmlRichText.js           — xmlToHtml / xmlToPlain (sup/sub handling)
│       └── services/
│           └── api.js                   — Axios base instance (unused — all calls use fetch directly)
│
└── backend/           Express server (port 5000) + Bing proxy (port 5001)
    ├── server.js                    — Main entry, registers routes
    ├── proxyServer.js               — Bing proxy (strips X-Frame-Options)
    ├── public/
    │   └── pdf-viewer.html          — Custom PDF.js viewer (served as static, used in iframe)
    ├── config/
    │   └── db.js                    — MongoDB connection (mongoose)
    ├── models/
    │   ├── User.js                  — { name, email, password, createdAt }
    │   ├── Article.js               — EMPTY stub
    │   └── ChatHistory.js           — EMPTY stub
    ├── controllers/
    │   ├── authController.js        — register / login (bcrypt + JWT)
    │   ├── uploadController.js
    │   ├── xmlController.js
    │   ├── chatbotController.js
    │   ├── validationController.js  — EMPTY stub
    │   └── diffController.js        — EMPTY stub
    ├── routes/
    │   ├── uploadRoutes.js          — POST /api/upload/files (main processing route)
    │   ├── aiRoutes.js              — POST /api/ai/ask, POST /api/ai/explain-issue
    │   ├── authRoutes.js            — POST /api/auth/register, POST /api/auth/login
    │   ├── searchRoutes.js          — GET /api/search?q= (DuckDuckGo proxy)
    │   ├── xmlRoutes.js             — GET /api/xml/parse (dev/test route, hardcoded path)
    │   ├── pdfRoutes.js             — GET /api/pdf/parse (dev/test route, hardcoded path)
    │   ├── validationRoutes.js      — EMPTY stub
    │   └── diffRoutes.js            — EMPTY stub
    └── engines/
        ├── xmlParserEngine.js       — Parses Elsevier CAR XML via fast-xml-parser
        ├── pdfParserEngine.js       — Parses PDF via pdf-parse, publisher-aware
        ├── comparisonEngine.js      — Compares XML vs PDF (string-similarity)
        ├── aiEngine.js              — Gemini 2.5 Flash (askAI + explainComparisonIssue)
        └── validationEngine.js      — EMPTY stub
```

## Running the Project

```bash
# Backend (port 5000 + 5001 Bing proxy)
cd backend && npm start

# Frontend (port 3000)
cd frontend && npm start
```

Requires `.env` in `backend/`:
```
MONGO_URI=...
JWT_SECRET=...
GEMINI_API_KEY=...   # optional — users can supply their own key via the UI
```

Uploaded files are saved under `backend/uploads/xml/` and `backend/uploads/pdf/`.

## Data Flow

1. User uploads XML + PDF via `FileUploadComponent`
2. `POST /api/upload/files` (multer) → `xmlParserEngine` + `pdfParserEngine` + `comparisonEngine`
3. Response `{ xml, pdf, comparison, files }` stored in Dashboard state
4. `ProofreadingWorkspace` renders all sections using that data
5. AI features call `POST /api/ai/ask` or `POST /api/ai/explain-issue` with `x-gemini-key` header

## Section Order (ProofreadingWorkspace)

Sections are rendered and tabbed in this fixed order:

1. Title
2. Authors
3. Affiliations
4. Correspondence
5. Copyright
6. Abstract
7. Keywords
8. Article Info  ← shows article number OR page range from XML `<volisspag>`
9. Grants
10. References

## Key Implementation Details

### xmlParserEngine.js
- Uses `fast-xml-parser` with `ignoreAttributes: false`, `attributeNamePrefix: ""`
- `isArray` config ensures `author`, `affiliation`, `reference`, etc. are always arrays
- Handles Elsevier CE namespace: `<ce:sup>` → `<sup>`, `<ce:inf>` → `<sub>`
- Extracts: titles (multi-language), authors + affNums, affiliations, correspondence, abstract + abstractHtml, keywords + keywordsHtml, references, grants, pages (DOI, vol, issue, articleNumber, firstPage, lastPage), copyright
- `extractAuthorsAndAffiliations()` handles both ID-based and group-based affiliation matching

### pdfParserEngine.js
- Uses `pdf-parse`
- Publisher detection (Elsevier, Oxford, IEEE, Springer, Wiley, World Scientific, generic)
- Tunes extraction heuristics per publisher

### comparisonEngine.js
- Uses `string-similarity` for fuzzy title matching (≥0.92 = match, ≥0.75 = warning)
- Checks: title, authors, affiliations, abstract, keywords, references count, grants

### aiEngine.js
- Gemini 2.5 Flash model
- `askAI(question, apiKey)` — uses `systemInstruction` with full `manual.txt` loaded once at startup
- `explainComparisonIssue(payload, apiKey)` — explains a specific comparison row in reviewer-friendly language
- Both functions accept an `apiKey` parameter; a new `GoogleGenerativeAI` instance is created per call
- The API key is **never logged** anywhere in the engine
- Friendly error messages returned for quota / invalid key / safety filter errors

### aiRoutes.js
- `resolveApiKey(req)` helper: reads `x-gemini-key` request header first, validates only minimum
  length ≥ 20 chars (no prefix check — Google periodically changes key format), then falls back
  to `process.env.GEMINI_API_KEY`
- Returns a user-facing error message if no valid key is found from either source
- Debug `console.log` of full payload removed for security

### server.js
- Uses `const path = require("path")` — all static paths use `path.join(__dirname, ...)` to be
  CWD-independent (avoids 404 if server is started from the wrong directory)
- Serves `backend/public/` via `app.use(express.static(path.join(__dirname, "public")))`
- Serves `backend/uploads/` via `app.use("/uploads", express.static(path.join(__dirname, "uploads")))`
- X-Frame-Options exemption for both `/uploads` (PDF files) and `/pdf-viewer.html`:
  ```js
  const noFrame = !req.path.startsWith("/uploads") && req.path !== "/pdf-viewer.html";
  if (noFrame) res.setHeader("X-Frame-Options", "DENY");
  ```
- CORS `allowedHeaders`: `["Content-Type", "Authorization", "x-gemini-key"]`
  — `x-gemini-key` must be explicitly listed because localhost:3000 → localhost:5000 is cross-origin

### pdf-viewer.html (backend/public/)
- Self-contained PDF viewer using **PDF.js 3.11.174** from `jsdelivr` CDN (switched from unpkg for reliability)
- Renders all pages as `<canvas>` + absolutely-positioned text-layer `<span>` elements
- Yellow highlight (`.hl`) + orange active highlight (`.hl-active`) for search matches
- Toolbar: search input, ◀ prev / ▶ next match buttons, match count (`X / Y`), page count
- Accepts query params: `?file=URL` (required) + `?search=TERM` (optional initial search)
- Listens for `postMessage` `{ type: "pdf-search", term }` for **live search without iframe reload**
  — uses `setInterval` polling if PDF hasn't finished rendering yet

### API Key Management (frontend)
- Users enter their Gemini API key via the **🔑 AI Key** button in the workspace topbar
- Key is stored in **`sessionStorage`** as `car_gemini_apikey` — cleared automatically when the
  browser tab closes; never written to `localStorage`
- Key is cleared from `sessionStorage` on logout
- Input is `type="password"` (masked); client-side validation: length ≥ 20 only (no prefix check)
- Sent as `x-gemini-key` HTTP header on every AI request (never in URL or body)
- Panel closes when clicking outside (click-outside handler via `useEffect` + `mousedown`)
- Green dot (●) = key active, orange dot (●) = no key set
- Link to `aistudio.google.com` for getting a free key
- **New Google API key format** (2024+): `xx.xxxxxxxxxxxxxx_xxxxxxxxx_xxxxxxxxxxxxxxxxxx_xxxxxx`
  — old `AIza…` prefix check removed from both frontend and backend to support new format

### ProofreadingWorkspace.jsx
- Resizable left/right split pane (drag handle, 20–80% range)
- Left pane: custom PDF viewer (iframe pointing to `pdf-viewer.html`) + XML source viewer with line numbers
- **PDF search**: sends `postMessage` `{ type: "pdf-search", term }` to the iframe — no reload
  needed. Iframe `src` is fixed to `http://localhost:5000/pdf-viewer.html?file=<encodedUrl>` and
  never changes. An `onLoad` handler re-sends any pending search term after iframe load.
- Section tab scroll uses `getBoundingClientRect()` (not `offsetTop`) to correctly account for
  the sticky tabs bar height regardless of intermediate positioned ancestors
- Right pane section cards in order: Title → Authors → Affiliations → Correspondence →
  Copyright → Abstract → Keywords → **Article Info** → Grants → References
- **Article Info card**: shows `xml.pages.articleNumber` if present; otherwise shows
  `firstPage–lastPage` page range; falls back to "Not found" message
- Affiliation chips: click → find in PDF via postMessage; 🌐 icon → open Google search (new tab)
- Section tabs with orange dot indicator for warnings/mismatches
- **Color Legend panel**: floating panel (🎨 Legend button in topbar) explaining all badge/chip
  colors — covers Comparison Status, Author Fields, Affiliation Chips, Keywords, Reference Issues

### AbstractDiffView.jsx
- Word-level diff using `diff` npm package (`diffWords`)
- **Diff is NOT run automatically** — reviewer must click "▶ Run Diff" explicitly (`diffActive` state)
- **XML panel switches view when diff is active**: shows only word-diff tokens (removed words
  struck through + highlighted) instead of the full rich HTML — reduces cognitive load
- When `!diffActive`, XML panel shows full rich-formatted abstract with sup/sub rendered
- PDF panel shows word-diff with added tokens highlighted when diff is active
- Reviewer can click **✏ Edit** to paste a corrected PDF abstract before running diff
- `applyEdit()` sets `diffActive = true` automatically (running diff is the point of editing)
- `resetToParser()` clears manual override and sets `diffActive = false`
- Also detects spacing/punctuation issues in both abstracts (double-space, space before punct, etc.)
- Displays sup/sub token list for manual visual verification against the original PDF

### ReferenceSpacingChecker.jsx
- Checks each reference for: double spaces, space before punctuation, missing space after
  comma/period, trailing whitespace, consecutive punctuation, hyphen instead of en-dash in
  page ranges, DOI with embedded space, missing publication year, missing terminal period
- Cross-reference consistency: mixed year-in-parens style, mixed ending punctuation
- Expanded by default, shows first 10 then "Show all"

### CSS — WorkspaceTheme.css
- `.aff-source` — affiliation source text: `font-size: 13px; color: #475569; line-height: 1.5`
- **UI cognitive load pass (2024)**: targeted improvements for readability —
  - CSS variables: warmer surface colors (`--surface-1: #f9fafb`, `--surface-2: #f3f4f6`),
    softer border (`--border: #e5e7eb`), softer shadow, slightly warmer text (`--text: #111827`)
  - Font sizes raised across the board: author text 14px, aff chips 13px, ref items 13.5px,
    diff text 13.5px, AI drawer 13.5px, issue messages 13.5px
  - Aff chips: more padding (3px 8px), rounder corners (5px)
  - Keyword chips: more padding (5px 13px), better indigo tones
  - Card headers: slightly less height (12px padding), cleaner `--surface-1` bg
  - Reference items: line-height 1.65, padding 10px 0
  - Topbar: lower box-shadow opacity for cleaner look, consistent whitespace-nowrap on items

## EMPTY STUB FILES (Work in Progress)

These files were created but not yet implemented:

| File | Purpose |
|------|---------|
| `backend/engines/validationEngine.js` | CAR-rules XML structure validator (required fields, format checks) independent of PDF comparison |
| `backend/routes/validationRoutes.js` | REST endpoints for the validation engine |
| `backend/routes/diffRoutes.js` | REST endpoints for diff functionality |
| `backend/controllers/validationController.js` | Controller for validation routes |
| `backend/controllers/diffController.js` | Controller for diff routes |
| `backend/models/Article.js` | MongoDB model for saving processed article sessions |
| `backend/models/ChatHistory.js` | MongoDB model for saving AI chat history per session |

Note: `validationRoutes` and `diffRoutes` are **not yet registered** in `server.js`.

## Known Issues / Still To Do

| Priority | Item |
|----------|------|
| High | Implement `validationEngine.js` + routes (CAR-rules XML validation, the main planned feature) |
| High | Protect API routes with JWT middleware (upload, AI, search are currently unprotected) |
| High | Fix keyword comparison in `comparisonEngine.js` — strip XML tags before matching (keywords with `<ce:sup>` etc. never match plain PDF text) |
| Medium | Save sessions to MongoDB (`Article.js`) so history persists across page refreshes |
| Medium | Export/report download (JSON or PDF of comparison results) |
| Medium | 401 → redirect to `/login` on token expiry (no interceptor on the frontend) |
| Low | Wire Bing proxy (port 5001) to an iframe, or remove it (currently unused) |
| Low | Centralise `fetch` calls via `api.js` (base URL hardcoded in 5+ places) |
| Low | Delete dead code: `ResultViewer.jsx`, unused controllers, dev-only `xmlRoutes`/`pdfRoutes` |
| Low | Add multer file size + MIME type limits on upload |

## Auth

- JWT-based, stored in `localStorage` as `token`
- `user` object also stored in `localStorage` (name shown in topbar)
- Rate limiting: 5 login attempts / 15 min, 10 registrations / IP / hour
- Protected routes redirect to `/login` if no token
- On logout: `localStorage` token + user cleared, `sessionStorage` API key cleared

## CSS / Theming

- Main workspace: `frontend/src/WorkspaceTheme.css`
- Dashboard: `frontend/src/pages/Dashboard.css`
- ResultViewer (legacy): `frontend/src/components/ResultViewer.css`
- Design: Inter/Segoe UI font, indigo/violet gradient brand colour (`#6366f1`, `#764ba2`)

## Dependencies (notable)

**Backend:** `express`, `fast-xml-parser`, `pdf-parse`, `string-similarity`, `@google/generative-ai`, `mongoose`, `bcryptjs`, `jsonwebtoken`, `multer`, `express-rate-limit`

**Frontend:** `react`, `react-router-dom`, `diff` (word-level diffing)
