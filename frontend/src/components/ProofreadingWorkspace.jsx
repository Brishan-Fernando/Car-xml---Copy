import "../WorkspaceTheme.css";
import ErrorPanel from "./ErrorPanel";
import AIChat from "./AIChat";
import AbstractDiffView from "./AbstractDiffView";
import ReferenceSpacingChecker from "./ReferenceSpacingChecker";
import { API_BASE_URL } from "../services/api";
import { xmlToHtml, xmlToPlain } from "../utils/xmlRichText";
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";

const SERVER_BASE = API_BASE_URL.replace(/\/api$/, "");

function joinUrl(base, nextPath) {
  return `${String(base || "").replace(/\/+$/, "")}/${String(nextPath || "").replace(/^\/+/, "")}`;
}
const SECTIONS = [
  { key: "title",          label: "Title" },
  { key: "authors",        label: "Authors" },
  { key: "affiliations",   label: "Affiliations" },
  { key: "correspondence", label: "Correspondence" },
  { key: "copyright",      label: "Copyright" },
  { key: "abstract",       label: "Abstract" },
  { key: "keywords",       label: "Keywords" },
  { key: "articleinfo",    label: "Article Info" },
  { key: "grants",         label: "Grants" },
  { key: "references",     label: "References" },
];

function StatusBadge({ status }) {
  const cls = `wb-issue-badge badge-${status}`;
  const label = { match: "✓ Match", warning: "⚠ Warning", mismatch: "✗ Mismatch", info: "ℹ Info" }[status] || status;
  return <span className={cls}>{label}</span>;
}

function ProofreadingWorkspace({ data, onReset }) {
  const [leftOpen, setLeftOpen]           = useState(true);
  const [previewTab, setPreviewTab]       = useState("pdf");
  const [activeSection, setActiveSection] = useState("title");
  const [highlightedSection, setHighlightedSection] = useState(null);
  const [leftWidth, setLeftWidth]         = useState(50); // percent
  const [pdfSearch, setPdfSearch]         = useState("");
  const [pdfSearchActive, setPdfSearchActive] = useState("");
  const [rawXml, setRawXml]               = useState("");

  // API key panel state
  const [showKeyPanel, setShowKeyPanel]   = useState(false);
  const [apiKeyInput, setApiKeyInput]     = useState("");
  const [apiKeySaved, setApiKeySaved]     = useState(() => !!sessionStorage.getItem("car_gemini_apikey"));
  const [apiKeyError, setApiKeyError]     = useState("");
  const keyPanelRef                       = useRef(null);

  // Legend panel state
  const [showLegend, setShowLegend]       = useState(false);
  const legendRef                         = useRef(null);

  const isDragging = useRef(false);
  const layoutRef  = useRef(null);
  const iframeRef  = useRef(null);

  const xml        = data?.xml        || {};
  const pdf        = data?.pdf        || {};
  const comparison = useMemo(() => {
  return data?.comparison || [];
}, [data]);

  const sectionRefs = useRef({});
  SECTIONS.forEach(({ key }) => {
    if (!sectionRefs.current[key]) sectionRefs.current[key] = React.createRef();
  });

  // Resizable divider drag logic
  const startDrag = useCallback((e) => {
    e.preventDefault();
    isDragging.current = true;
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      if (!isDragging.current || !layoutRef.current) return;
      const rect = layoutRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.min(80, Math.max(20, (x / rect.width) * 100));
      setLeftWidth(pct);
    };
    const onUp = () => { isDragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const pdfUrl = useMemo(() => {
    const path = data?.files?.pdfPath;
    return path ? joinUrl(SERVER_BASE, path) : null;
  }, [data]);

  // Fetch raw XML file text from server 
  useEffect(() => {
    const path = data?.files?.xmlPath;
    if (!path) return;
    fetch(joinUrl(SERVER_BASE, path))
      .then(r => r.text())
      .then(text => setRawXml(text))
      .catch(() => setRawXml("Could not load XML source."));
  }, [data?.files?.xmlPath]);

  // Custom PDF.js viewer served from backend 
  const pdfViewerSrc = useMemo(() => {
    if (!pdfUrl) return null;
    return `${joinUrl(SERVER_BASE, "/pdf-viewer.html")}?file=${encodeURIComponent(pdfUrl)}`;
  }, [pdfUrl]);

  // Send search term to the already-loaded viewer via postMessage (no reload needed)
  const postSearch = useCallback((term) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: "pdf-search", term }, "*");
    }
  }, []);

  const triggerPdfSearch = useCallback((override) => {
    const raw  = override !== undefined ? override : pdfSearch;
    const term = String(raw == null ? "" : raw).trim();
    setPdfSearchActive(term);
    postSearch(term);
  }, [pdfSearch, postSearch]);

  const searchInPdf = useCallback((text) => {
    const term = String(text == null ? "" : text).trim();
    if (!term) return;
    setPdfSearch(term);
    setPdfSearchActive(term);
    if (previewTab !== "pdf") {
      setPreviewTab("pdf");
      // Give the tab a moment to mount the iframe before posting
      setTimeout(() => postSearch(term), 150);
    } else {
      postSearch(term);
    }
  }, [previewTab, postSearch]);

  // Open Google search in a new tab — used by 🌐 icons on affiliation chips
  const showFloatSearch = useCallback((text) => {
    const term = String(text == null ? "" : text).trim();
    if (!term) return;
    window.open(`https://www.google.com/search?q=${encodeURIComponent(term)}`, "_blank", "noopener,noreferrer");
  }, []);

  const getStatusForSection = useCallback((sectionLabel) => {
    const c = comparison.find(r => r.field.toLowerCase() === sectionLabel.toLowerCase());
    return c?.status || null;
  }, [comparison]);

  // Scroll inside wb-main accounting for the sticky section-tabs bar
  const scrollToKey = useCallback((key) => {
    const ref = sectionRefs.current[key];
    const mainEl = ref?.current?.closest(".wb-main");
    if (!ref?.current || !mainEl) return;
    const tabsBar = mainEl.querySelector(".wb-section-tabs");
    const tabsH = tabsBar ? tabsBar.offsetHeight : 52;
    const cardRect = ref.current.getBoundingClientRect();
    const mainRect = mainEl.getBoundingClientRect();
    const targetScroll = mainEl.scrollTop + (cardRect.top - mainRect.top) - tabsH - 8;
    mainEl.scrollTo({ top: targetScroll, behavior: "smooth" });
  }, []);

  const handleJump = useCallback((fieldName) => {
    const match = SECTIONS.find(s => s.label.toLowerCase() === fieldName.toLowerCase());
    const key = match?.key || fieldName.toLowerCase();
    setActiveSection(key);
    setHighlightedSection(key);
    scrollToKey(key);
    setTimeout(() => setHighlightedSection(null), 2500);
  }, [scrollToKey]);

  const scrollTo = (key) => {
    setActiveSection(key);
    scrollToKey(key);
  };

  // API key handlers
  const saveApiKey = useCallback(() => {
    const key = apiKeyInput.trim();
    if (!key) { setApiKeyError("Please enter a key."); return; }
    if (key.length < 20) {
      setApiKeyError("Key looks too short — please copy the full key from AI Studio.");
      return;
    }
    sessionStorage.setItem("car_gemini_apikey", key);
    setApiKeySaved(true);
    setApiKeyInput("");
    setApiKeyError("");
    setShowKeyPanel(false);
  }, [apiKeyInput]);

  const clearApiKey = useCallback(() => {
    sessionStorage.removeItem("car_gemini_apikey");
    setApiKeySaved(false);
    setApiKeyInput("");
    setApiKeyError("");
  }, []);

  // Close panel when clicking outside
  useEffect(() => {
    if (!showKeyPanel) return;
    const handler = (e) => {
      if (keyPanelRef.current && !keyPanelRef.current.contains(e.target)) {
        setShowKeyPanel(false);
        setApiKeyError("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showKeyPanel]);

  // Close legend when clicking outside
  useEffect(() => {
    if (!showLegend) return;
    const handler = (e) => {
      if (legendRef.current && !legendRef.current.contains(e.target))
        setShowLegend(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showLegend]);

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    // Clear the API key from session on logout for safety
    sessionStorage.removeItem("car_gemini_apikey");
    window.location.href = "/login";
  };

  const issueCount = comparison.filter(c => c.status === "warning" || c.status === "mismatch").length;

  // Reverse map: affiliation number → list of authors who belong to it
  const authorsByAffNum = useMemo(() => {
    const map = {};
    (xml.authors || []).forEach(a => {
      (a.affNums || []).forEach(n => {
        if (!map[n]) map[n] = [];
        map[n].push(a);
      });
    });
    return map;
  }, [xml.authors]);

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
        {onReset && (
          <button className="wb-toggle-btn" onClick={onReset} title="Upload new files">
            ↩ New Files
          </button>
        )}

        {/* LEGEND BUTTON + PANEL */}
        <div ref={legendRef} style={{ position: "relative" }}>
          <button
            className="wb-toggle-btn"
            onClick={() => setShowLegend(v => !v)}
            title="Color legend for authors, affiliations, and status badges"
          >📖 Legend</button>

          {showLegend && (
            <div style={{
              position: "absolute", top: "calc(100% + 10px)", right: 0, zIndex: 2000,
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14,
              padding: "16px 18px", width: 370,
              boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
              maxHeight: "80vh", overflowY: "auto",
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: "#1e293b" }}>
                📖 Color Legend
              </div>

              {/* Status Badges */}
              <div style={{ fontWeight: 700, fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Comparison Status</div>
              {[
                { label: "✓ Match",    bg: "#dcfce7", color: "#15803d", desc: "XML and PDF values agree" },
                { label: "⚠ Warning",  bg: "#fef9c3", color: "#a16207", desc: "Values are similar but differ slightly" },
                { label: "✗ Mismatch", bg: "#fee2e2", color: "#b91c1c", desc: "Values differ significantly" },
                { label: "ℹ Info",     bg: "#dbeafe", color: "#1d4ed8", desc: "Informational note (e.g. reference count)" },
              ].map(r => (
                <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                  <span style={{ background: r.bg, color: r.color, padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, minWidth: 72 }}>{r.label}</span>
                  <span style={{ fontSize: 12, color: "#64748b" }}>{r.desc}</span>
                </div>
              ))}

              <hr style={{ border: "none", borderTop: "1px solid #f1f5f9", margin: "10px 0" }} />

              {/* Author fields */}
              <div style={{ fontWeight: 700, fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Author Fields</div>
              {[
                { label: "#1",       bg: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border)", desc: "Sequence number" },
                { label: "A.B.",     bg: "transparent",      color: "#dc2626",           border: "none",                   desc: "Initials",         bold: true },
                { label: "Given",    bg: "#fef9c3",          color: "#854d0e",           border: "none",                   desc: "Given / first name" },
                { label: "Surname",  bg: "transparent",      color: "#1d4ed8",           border: "none",                   desc: "Surname",          bold: true },
                { label: "MD, PhD",  bg: "transparent",      color: "#16a34a",           border: "none",                   desc: "Degrees" },
                { label: "ORCID",    bg: "transparent",      color: "#d97706",           border: "none",                   desc: "ORCID iD" },
                { label: "email",    bg: "transparent",      color: "#7c3aed",           border: "none",                   desc: "Email address",    italic: true },
                { label: "①②",      bg: "#ede9fe",          color: "#6d28d9",           border: "none",                   desc: "Affiliation number badges" },
              ].map(r => (
                <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ background: r.bg, color: r.color, padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: r.bold ? 700 : 500, fontStyle: r.italic ? "italic" : "normal", border: r.border, minWidth: 72, textAlign: "center" }}>{r.label}</span>
                  <span style={{ fontSize: 12, color: "#64748b" }}>{r.desc}</span>
                </div>
              ))}

              <hr style={{ border: "none", borderTop: "1px solid #f1f5f9", margin: "10px 0" }} />

              {/* Affiliation chips */}
              <div style={{ fontWeight: 700, fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Affiliation Chips</div>
              {[
                { label: "Organization", bg: "#cffafe", color: "#164e63", desc: "Institution / department name" },
                { label: "Address",      bg: "#f1f5f9", color: "#475569", desc: "Street / address part" },
                { label: "City",         bg: "#fce7f3", color: "#831843", desc: "City" },
                { label: "State",        bg: "#fdf4ff", color: "#701a75", desc: "State / province" },
                { label: "Postal",       bg: "#dcfce7", color: "#14532d", desc: "Postal / ZIP code" },
                { label: "Country",      bg: "#fef3c7", color: "#92400e", desc: "Country" },
              ].map(r => (
                <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ background: r.bg, color: r.color, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, minWidth: 90 }}>{r.label}</span>
                  <span style={{ fontSize: 12, color: "#64748b" }}>{r.desc}</span>
                </div>
              ))}

              <hr style={{ border: "none", borderTop: "1px solid #f1f5f9", margin: "10px 0" }} />

              {/* Keywords */}
              <div style={{ fontWeight: 700, fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Keywords</div>
              {[
                { label: "Keyword", bg: "var(--primary-light)", color: "var(--primary-dark)", desc: "Found in PDF text" },
                { label: "Keyword", bg: "#fee2e2",              color: "#b91c1c",              desc: "Not found in PDF text — verify manually" },
              ].map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ background: r.bg, color: r.color, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, minWidth: 72, textAlign: "center" }}>{r.label}</span>
                  <span style={{ fontSize: 12, color: "#64748b" }}>{r.desc}</span>
                </div>
              ))}

              <hr style={{ border: "none", borderTop: "1px solid #f1f5f9", margin: "10px 0" }} />

              {/* Reference issues */}
              <div style={{ fontWeight: 700, fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Reference Issue Types</div>
              {[
                { label: "⎵ Spacing", color: "#f97316", desc: "Double space / missing space after punctuation" },
                { label: "⚠ Format",  color: "#eab308", desc: "En-dash, consecutive punctuation, DOI spacing" },
                { label: "✗ Missing", color: "#ef4444", desc: "No publication year or other required element" },
              ].map(r => (
                <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ background: r.color + "1a", color: r.color, padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700, border: `1px solid ${r.color}50`, minWidth: 72 }}>{r.label}</span>
                  <span style={{ fontSize: 12, color: "#64748b" }}>{r.desc}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* API KEY BUTTON + PANEL */}
        <div ref={keyPanelRef} style={{ position: "relative" }}>
          <button
            className="wb-toggle-btn"
            onClick={() => { setShowKeyPanel(v => !v); setApiKeyError(""); }}
            title={apiKeySaved ? "API key is set — click to update or clear" : "Set your Gemini API key"}
            style={{ display: "flex", alignItems: "center", gap: 5 }}
          >
            🔑 AI Key&nbsp;
            <span style={{ fontSize: 8, color: apiKeySaved ? "#4ade80" : "#f97316" }}>●</span>
          </button>

          {showKeyPanel && (
            <div style={{
              position: "absolute", top: "calc(100% + 10px)", right: 0, zIndex: 2000,
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14,
              padding: "18px 18px 14px", width: 310,
              boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: "#1e293b" }}>
                🔑 Gemini API Key
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12, lineHeight: 1.5 }}>
                Your key is stored in this browser session only — it is never sent to any server other than Google, and is automatically cleared when you close the tab.
              </div>

              {apiKeySaved && (
                <div style={{
                  fontSize: 12, color: "#16a34a", fontWeight: 600,
                  marginBottom: 10, padding: "5px 10px",
                  background: "#f0fdf4", borderRadius: 7, border: "1px solid #bbf7d0",
                }}>
                  ✓ Key is active for this session
                </div>
              )}

              <input
                type="password"
                value={apiKeyInput}
                onChange={e => { setApiKeyInput(e.target.value); setApiKeyError(""); }}
                onKeyDown={e => e.key === "Enter" && saveApiKey()}
                placeholder={apiKeySaved ? "Enter a new key to replace…" : "Paste your Gemini API key…"}
                autoFocus
                style={{
                  width: "100%", padding: "8px 10px", border: `1px solid ${apiKeyError ? "#f87171" : "#d1d5db"}`,
                  borderRadius: 8, fontSize: 13, fontFamily: "monospace",
                  outline: "none", boxSizing: "border-box",
                  background: "#f8fafc",
                }}
              />

              {apiKeyError && (
                <div style={{ fontSize: 11.5, color: "#dc2626", marginTop: 5 }}>⚠ {apiKeyError}</div>
              )}

              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <button
                  onClick={saveApiKey}
                  style={{
                    flex: 1, padding: "7px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                    background: "linear-gradient(135deg, #6366f1, #764ba2)", color: "#fff",
                    border: "none", borderRadius: 8,
                  }}
                >Save</button>
                {apiKeySaved && (
                  <button
                    onClick={clearApiKey}
                    style={{
                      padding: "7px 12px", fontSize: 12, cursor: "pointer",
                      background: "transparent", color: "#ef4444",
                      border: "1px solid #fca5a5", borderRadius: 8, fontWeight: 600,
                    }}
                  >Clear</button>
                )}
                <button
                  onClick={() => { setShowKeyPanel(false); setApiKeyError(""); }}
                  style={{
                    padding: "7px 12px", fontSize: 12, cursor: "pointer",
                    background: "transparent", color: "#64748b",
                    border: "1px solid #e2e8f0", borderRadius: 8,
                  }}
                >Cancel</button>
              </div>

              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 10 }}>
                Get a free key at{" "}
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer"
                  style={{ color: "#6366f1" }}>
                  aistudio.google.com
                </a>
              </div>
            </div>
          )}
        </div>

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
      <div ref={layoutRef} className="wb-layout" style={{ flex: 1, overflow: "hidden" }}>

        {/* LEFT PANE */}
        {leftOpen && (
          <div className="wb-left" style={{ width: `${leftWidth}%`, minWidth: "20%", maxWidth: "80%" }}>
            <div className="wb-left-tabs">
              <button
                className={`wb-left-tab ${previewTab === "pdf" ? "active" : ""}`}
                onClick={() => setPreviewTab("pdf")}
              >📄 PDF</button>
              <button
                className={`wb-left-tab ${previewTab === "xml" ? "active" : ""}`}
                onClick={() => setPreviewTab("xml")}
              >{ } XML Source</button>
            </div>
            <div className="wb-left-content">
              {previewTab === "pdf" ? (
                <>
                  <div style={{ display: "flex", gap: 6, padding: "8px 10px", borderBottom: "1px solid var(--border)", background: "var(--surface-1)", flexShrink: 0 }}>
                    <input
                      type="text"
                      value={pdfSearch}
                      onChange={e => setPdfSearch(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && triggerPdfSearch()}
                      placeholder="Search in PDF (e.g. affiliation text)…"
                      style={{
                        flex: 1, padding: "6px 10px", border: "1px solid var(--border)",
                        borderRadius: 8, fontSize: 12, fontFamily: "inherit", outline: "none",
                        background: "#fff",
                      }}
                    />
                    <button
                      onClick={triggerPdfSearch}
                      style={{
                        padding: "6px 14px", background: "linear-gradient(135deg, #667eea, #764ba2)",
                        color: "#fff", border: "none", borderRadius: 8, fontSize: 12,
                        fontWeight: 600, cursor: "pointer",
                      }}
                    >Search</button>
                  </div>
                  {pdfViewerSrc
                    ? <iframe
                        ref={iframeRef}
                        title="PDF Viewer"
                        src={pdfViewerSrc}
                        onLoad={() => { if (pdfSearchActive) postSearch(pdfSearchActive); }}
                        style={{ width: "100%", flex: 1, border: "none", display: "block" }}
                      />
                    : <div style={{ padding: 20, color: "var(--text-muted)", fontSize: 13 }}>No PDF loaded</div>
                  }
                </>
              ) : (
                <div style={{ height: "100%", overflow: "auto", background: "#fff", fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace", fontSize: 12, lineHeight: 1.6 }}>
                  {(rawXml || "Loading XML…").split("\n").map((line, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start" }}>
                      <span style={{
                        minWidth: "42px", textAlign: "right", paddingRight: "12px",
                        color: "#94a3b8", userSelect: "none", borderRight: "1px solid #e2e8f0",
                        marginRight: "12px", flexShrink: 0, fontSize: 11,
                      }}>{i + 1}</span>
                      <span style={{
                        color: "#1e293b",
                        whiteSpace: "pre-wrap",
                        overflowWrap: "break-word",
                        flex: 1,
                      }}>{line}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* DRAG HANDLE */}
        {leftOpen && (
          <div
            onMouseDown={startDrag}
            style={{
              width: "5px", cursor: "col-resize", background: "#e2e8f0",
              flexShrink: 0, transition: "background 0.15s", zIndex: 10,
            }}
            onMouseEnter={e => e.currentTarget.style.background = "#667eea"}
            onMouseLeave={e => e.currentTarget.style.background = "#e2e8f0"}
          />
        )}

        {/* MAIN PANE */}
        <div className="wb-main" style={{ flex: 1, minWidth: 0 }}>
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
                {/* All language variants from XML */}
                {(xml.titles && xml.titles.length > 0) ? (
                  xml.titles.map((t, i) => (
                    <div key={i} style={{ marginBottom: i < xml.titles.length - 1 ? 10 : 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                        <div className="wb-data-label" style={{ margin: 0 }}>XML Title</div>
                        {t.lang && (
                          <span style={{
                            fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 10,
                            background: "#eff6ff", color: "#3b82f6", border: "1px solid #bfdbfe",
                          }}>{t.lang}</span>
                        )}
                        {t.original && (
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 10,
                            background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0",
                          }}>original</span>
                        )}
                      </div>
                      <div className="wb-data-value">{t.text}</div>
                    </div>
                  ))
                ) : (
                  <>
                    <div className="wb-data-label">XML Title</div>
                    <div className="wb-data-value">{xml.title || <em style={{color:"var(--text-muted)"}}>Not found</em>}</div>
                  </>
                )}
                {pdf.title && (
                  <>
                    <div className="wb-data-label" style={{ marginTop: 10 }}>PDF Title</div>
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
                      {(a.affNums || []).length > 0 && (
                        <span className="author-aff-nums" title={`Affiliations: ${a.affNums.join(", ")}`}>
                          {a.affNums.map(n => <span key={n} className="author-aff-badge">{n}</span>)}
                        </span>
                      )}
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
                {(xml.affiliations || []).length > 0 && (
                  <div className="aff-search-hint">🔍 Click chip → find in PDF &nbsp;&nbsp;🌐 Globe → search in Google</div>
                )}
                {(xml.affiliations || []).length === 0
                  ? <em style={{color:"var(--text-muted)", fontSize:13}}>No affiliations found</em>
                  : (xml.affiliations || []).map((aff, i) => {
                    const orgs = aff.organizations?.length ? aff.organizations : (aff.organization ? [aff.organization] : []);
                    const num  = aff.num || (i + 1);
                    const linkedAuthors = (authorsByAffNum[num] || [])
                      .map(a => [a.givenName, a.surname].filter(Boolean).join(" ") || a.initials)
                      .filter(Boolean);
                    return (
                      <div key={i} className="aff-card">
                        <div className="aff-card-top">
                          <span className="aff-num-badge">{num}</span>
                          <div style={{flex:1}}>
                            <div className="aff-tags">
                              {/* Each chip searches in PDF on click; 🌐 icon opens Google float */}
                              {orgs.map((org, j) => (
                                <span key={j} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                                  <span className="aff-org aff-chip" onClick={() => searchInPdf(org)} title={`Find "${org}" in PDF`}>{org}</span>
                                  <span onClick={() => showFloatSearch(org)} title={`Search "${org}" in Google`} style={{ cursor: "pointer", fontSize: 13, opacity: 0.6, userSelect: "none" }}>🌐</span>
                                </span>
                              ))}
                              {aff.address && (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                                  <span className="aff-address aff-chip" onClick={() => searchInPdf(aff.address)} title="Find address in PDF">{aff.address}</span>
                                  <span onClick={() => showFloatSearch(aff.address)} title="Search address in Google" style={{ cursor: "pointer", fontSize: 13, opacity: 0.6, userSelect: "none" }}>🌐</span>
                                </span>
                              )}
                              {aff.city && (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                                  <span className="aff-city aff-chip" onClick={() => searchInPdf(aff.city)} title="Find city in PDF">{aff.city}</span>
                                  <span onClick={() => showFloatSearch(aff.city)} title="Search city in Google" style={{ cursor: "pointer", fontSize: 13, opacity: 0.6, userSelect: "none" }}>🌐</span>
                                </span>
                              )}
                              {aff.state && (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                                  <span className="aff-state aff-chip" onClick={() => searchInPdf(aff.state)} title="Find state in PDF">{aff.state}</span>
                                  <span onClick={() => showFloatSearch(aff.state)} title="Search state in Google" style={{ cursor: "pointer", fontSize: 13, opacity: 0.6, userSelect: "none" }}>🌐</span>
                                </span>
                              )}
                              {aff.postalCode && <span className="aff-postal aff-chip" onClick={() => searchInPdf(aff.postalCode)} title="Find postal code in PDF">{aff.postalCode}</span>}
                              {aff.country && (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                                  <span className="aff-country aff-chip" onClick={() => searchInPdf(aff.country)} title="Find country in PDF">{aff.country}</span>
                                  <span onClick={() => showFloatSearch(aff.country)} title="Search country in Google" style={{ cursor: "pointer", fontSize: 13, opacity: 0.6, userSelect: "none" }}>🌐</span>
                                </span>
                              )}
                            </div>
                            {linkedAuthors.length > 0 && (
                              <div className="aff-authors-row">
                                <span className="aff-authors-label">Authors:</span>
                                {linkedAuthors.map((name, j) => (
                                  <span key={j} className="aff-author-chip">{name}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginTop: 6}}>
                          {aff.sourceText
                            ? <div className="aff-source">Source: {aff.sourceText}</div>
                            : <span />
                          }
                          <button
                            className="aff-search-btn aff-web-btn"
                            onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(orgs.join(" "))}`, "_blank")}
                            title="Verify on Google"
                          >🌐 Verify on Web</button>
                        </div>
                      </div>
                    );
                  })
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
                    <div key={i} style={{ marginBottom: i < xml.correspondence.length - 1 ? 12 : 0 }}>
                      <div className="author-card">
                        {c.initials && <span className="author-initials">{c.initials}</span>}
                        {c.givenName && <span className="author-given">{c.givenName}</span>}
                        {c.surname && <span className="author-surname">{c.surname}</span>}
                        {c.email && <span className="author-email">✉ {c.email}</span>}
                      </div>
                      {/* Correspondence-specific affiliation — shown here, NOT in Affiliations card */}
                      {c.affiliation && (
                        <div style={{
                          marginTop: 6, marginLeft: 8, padding: "6px 10px",
                          background: "#f8fafc", borderRadius: 8,
                          borderLeft: "3px solid #6366f1", fontSize: 12.5,
                        }}>
                          <div style={{ fontWeight: 600, color: "#6366f1", fontSize: 11, marginBottom: 4 }}>
                            Correspondence Address
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {(c.affiliation.organizations || []).map((org, j) => (
                              <span key={j} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                                <span className="aff-org aff-chip" onClick={() => searchInPdf(org)} title="Find in PDF">{org}</span>
                                <span onClick={() => showFloatSearch(org)} title="Search in Bing" style={{ cursor: "pointer", fontSize: 13, opacity: 0.6, userSelect: "none" }}>🌐</span>
                              </span>
                            ))}
                            {c.affiliation.address && (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                                <span className="aff-address aff-chip" onClick={() => searchInPdf(c.affiliation.address)}>{c.affiliation.address}</span>
                                <span onClick={() => showFloatSearch(c.affiliation.address)} title="Search in Bing" style={{ cursor: "pointer", fontSize: 13, opacity: 0.6, userSelect: "none" }}>🌐</span>
                              </span>
                            )}
                            {c.affiliation.city && (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                                <span className="aff-city aff-chip" onClick={() => searchInPdf(c.affiliation.city)}>{c.affiliation.city}</span>
                                <span onClick={() => showFloatSearch(c.affiliation.city)} title="Search in Bing" style={{ cursor: "pointer", fontSize: 13, opacity: 0.6, userSelect: "none" }}>🌐</span>
                              </span>
                            )}
                            {c.affiliation.state && (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                                <span className="aff-state aff-chip" onClick={() => searchInPdf(c.affiliation.state)}>{c.affiliation.state}</span>
                                <span onClick={() => showFloatSearch(c.affiliation.state)} title="Search in Bing" style={{ cursor: "pointer", fontSize: 13, opacity: 0.6, userSelect: "none" }}>🌐</span>
                              </span>
                            )}
                            {c.affiliation.postalCode && <span className="aff-postal aff-chip" onClick={() => searchInPdf(c.affiliation.postalCode)}>{c.affiliation.postalCode}</span>}
                            {c.affiliation.country && (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                                <span className="aff-country aff-chip" onClick={() => searchInPdf(c.affiliation.country)}>{c.affiliation.country}</span>
                                <span onClick={() => showFloatSearch(c.affiliation.country)} title="Search in Bing" style={{ cursor: "pointer", fontSize: 13, opacity: 0.6, userSelect: "none" }}>🌐</span>
                              </span>
                            )}
                          </div>
                          {c.affiliation.sourceText && (
                            <div className="aff-source" style={{ marginTop: 4 }}>Source: {c.affiliation.sourceText}</div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                }
              </div>
            </div>

            {/* COPYRIGHT */}
            <div ref={sectionRefs.current.copyright} className={`wb-card ${highlightedSection === "copyright" ? "highlighted" : ""}`}>
              <div className="wb-card-header">
                <span className="wb-card-title">Copyright</span>
              </div>
              <div className="wb-card-body">
                {xml.copyright
                  ? <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>{xml.copyright}</div>
                  : <em style={{ color: "var(--text-muted)", fontSize: 13 }}>No copyright found</em>
                }
              </div>
            </div>

            {/* ABSTRACT */}
            <div ref={sectionRefs.current.abstract} className={`wb-card ${highlightedSection === "abstract" ? "highlighted" : ""}`}>
              <div className="wb-card-header">
                <span className="wb-card-title">Abstract</span>
                {xml.abstractLang && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
                    background: "#eff6ff", color: "#3b82f6", border: "1px solid #bfdbfe",
                  }}>{xml.abstractLang}</span>
                )}
                {getStatusForSection("Abstract") && <StatusBadge status={getStatusForSection("Abstract")} />}
              </div>
              <div className="wb-card-body">
                {/* Word-level diff view when both abstracts available */}
                {xml.abstract && pdf.abstract ? (
                  <AbstractDiffView
                    xmlAbstract={xml.abstract}
                    xmlAbstractHtml={xml.abstractHtml}
                    pdfAbstract={pdf.abstract}
                    abstractSupSub={xml.abstractSupSub || []}
                  />
                ) : (
                  <>
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
                        // Use backend keywordsHtml if available, else convert inline
                        const kwHtml  = xml.keywordsHtml?.[i] || xmlToHtml(kw);
                        const kwPlain = xmlToPlain(kw);
                        const inPdf   = pdf.fullText && pdf.fullText.toLowerCase().includes(kwPlain.toLowerCase());
                        return (
                          <span key={i} className={`kw-chip ${!inPdf && pdf.fullText ? "missing" : ""}`}>
                            <span dangerouslySetInnerHTML={{ __html: kwHtml }} />
                          </span>
                        );
                      })
                  }
                </div>
                {(pdf.keywords || []).length > 0 && (
                  <>
                    <div className="wb-data-label">PDF Keywords</div>
                    <div className="kw-chips">
                      {pdf.keywords.map((kw, i) => (
                        <span key={i} className="kw-chip" style={{background:"var(--surface-2)"}}>{kw}</span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ARTICLE INFO — article number OR page range */}
            <div ref={sectionRefs.current.articleinfo} className={`wb-card ${highlightedSection === "articleinfo" ? "highlighted" : ""}`}>
              <div className="wb-card-header">
                <span className="wb-card-title">Article Info</span>
              </div>
              <div className="wb-card-body">
                {xml.pages?.articleNumber ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                    <span style={{
                      fontWeight: 700, color: "#6366f1", background: "#eef2ff",
                      padding: "4px 14px", borderRadius: 20, fontSize: 13,
                      border: "1px solid #c7d2fe",
                    }}>
                      Article Number
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 16, color: "#1e293b" }}>
                      {xml.pages.articleNumber}
                    </span>
                  </div>
                ) : (xml.pages?.firstPage || xml.pages?.lastPage) ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                    <span style={{
                      fontWeight: 700, color: "#0369a1", background: "#e0f2fe",
                      padding: "4px 14px", borderRadius: 20, fontSize: 13,
                      border: "1px solid #bae6fd",
                    }}>
                      Page Range
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 16, color: "#1e293b" }}>
                      {xml.pages.firstPage || "?"}
                      <span style={{ color: "#94a3b8", margin: "0 4px" }}>–</span>
                      {xml.pages.lastPage || "?"}
                    </span>
                  </div>
                ) : (
                  <em style={{ color: "var(--text-muted)", fontSize: 13 }}>
                    No article number or page range found in XML
                  </em>
                )}
                {/* Volume / Issue if available */}
                {(xml.pages?.volume || xml.pages?.issue) && (
                  <div style={{ marginTop: 8, fontSize: 12.5, color: "#64748b" }}>
                    {xml.pages.volume && <span>Volume <strong>{xml.pages.volume}</strong></span>}
                    {xml.pages.volume && xml.pages.issue && <span style={{ margin: "0 6px" }}>·</span>}
                    {xml.pages.issue  && <span>Issue <strong>{xml.pages.issue}</strong></span>}
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

            {/* REFERENCES */}
            <div ref={sectionRefs.current.references} className={`wb-card ${highlightedSection === "references" ? "highlighted" : ""}`}>
              <div className="wb-card-header">
                <span className="wb-card-title">References</span>
                <span className="wb-issue-badge badge-info" style={{marginLeft:8}}>
                  XML: {(xml.references || []).length} | PDF: {(pdf.references || []).length}
                </span>
              </div>
              <div className="wb-card-body">
                <ReferenceSpacingChecker
                  references={xml.references}
                  pdfReferenceCount={(pdf.references || []).length}
                />
              </div>
            </div>

          </div>
        </div>
      </div>

      <AIChat />

    </div>
  );
}

export default ProofreadingWorkspace;
