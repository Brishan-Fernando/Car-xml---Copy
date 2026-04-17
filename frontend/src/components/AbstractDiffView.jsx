import React, { useMemo, useState } from "react";
import { diffWords } from "diff";
import { xmlToHtml, xmlToPlain } from "../utils/xmlRichText";

// ─── Spacing / punctuation issue detector ──────────────────────────────────
function detectSpacingIssues(xmlText, pdfText) {
  const issues = [];

  const checks = [
    { text: xmlText, label: "XML" },
    { text: pdfText, label: "PDF" },
  ];

  checks.forEach(({ text, label }) => {
    if (!text) return;

    const stripped = text.replace(/https?:\/\/\S+/g, "");
    if (/  +/.test(stripped)) {
      const locs = [...stripped.matchAll(/  +/g)].length;
      issues.push({ label, type: "double-space", msg: `${locs} double-space${locs > 1 ? "s" : ""} detected` });
    }

    const noSpaceAfterPeriod = [...text.matchAll(/[a-z]\.[A-Z]/g)];
    if (noSpaceAfterPeriod.length) {
      issues.push({ label, type: "no-space-after-period", msg: `Missing space after period near: "${noSpaceAfterPeriod[0][0]}"` });
    }

    if (/\s[,;:.!?]/.test(text)) {
      const ex = text.match(/\s[,;:.!?]/)?.[0] || "";
      issues.push({ label, type: "space-before-punct", msg: `Space before punctuation near: "${ex.trim()}"` });
    }

    const noSpaceAfterComma = [...text.matchAll(/[,;][A-Za-z]/g)];
    if (noSpaceAfterComma.length) {
      issues.push({ label, type: "no-space-after-comma", msg: `Missing space after comma/semicolon near: "${noSpaceAfterComma[0][0]}"` });
    }

    if (/[ \t]+\n/.test(text) || /[ \t]+$/.test(text)) {
      issues.push({ label, type: "trailing-space", msg: "Trailing whitespace detected" });
    }
  });

  return issues;
}

// ─── Token renderer ─────────────────────────────────────────────────────────
function DiffTokens({ parts, highlightProp }) {
  return (
    <>
      {parts.map((part, i) => {
        if (part[highlightProp]) {
          return (
            <mark key={i} className={highlightProp === "removed" ? "diff-word-removed" : "diff-word-added"}>
              {part.value}
            </mark>
          );
        }
        return <span key={i}>{part.value}</span>;
      })}
    </>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function AbstractDiffView({ xmlAbstract, xmlAbstractHtml, pdfAbstract, abstractSupSub = [] }) {
  const [collapsed,    setCollapsed]    = useState(false);
  // null  = use the parser-provided pdfAbstract; string = reviewer override
  const [manualPdf,    setManualPdf]    = useState(null);
  const [editDraft,    setEditDraft]    = useState("");
  const [isEditing,    setIsEditing]    = useState(false);
  // Diff is NOT run automatically — reviewer must click "Run Diff" explicitly
  const [diffActive,   setDiffActive]   = useState(false);

  const effectivePdf = manualPdf !== null ? manualPdf : (pdfAbstract || "");

  const xmlPlain       = useMemo(() => xmlToPlain(xmlAbstract || ""), [xmlAbstract]);
  const xmlDisplayHtml = xmlAbstractHtml || xmlToHtml(xmlAbstract || "") || null;

  // Only compute diffs when reviewer explicitly activates comparison
  const diffs = useMemo(() => {
    if (!diffActive || !xmlPlain || !effectivePdf) return null;
    return diffWords(xmlPlain.trim(), effectivePdf.trim());
  }, [diffActive, xmlPlain, effectivePdf]);

  const spacingIssues = useMemo(
    () => detectSpacingIssues(xmlAbstract, effectivePdf),
    [xmlAbstract, effectivePdf]
  );

  const startEdit = () => {
    setEditDraft(effectivePdf);
    setIsEditing(true);
  };

  const applyEdit = () => {
    setManualPdf(editDraft);
    setDiffActive(true);   // running diff is the whole point of editing
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditDraft("");
  };

  const resetToParser = () => {
    setManualPdf(null);
    setDiffActive(false);
    setIsEditing(false);
    setEditDraft("");
  };

  const xmlParts = diffs ? diffs.filter(d => !d.added)   : [];
  const pdfParts = diffs ? diffs.filter(d => !d.removed) : [];

  const removedCount = diffs ? diffs.filter(d => d.removed).length : 0;
  const addedCount   = diffs ? diffs.filter(d => d.added).length   : 0;
  const hasIssues    = removedCount > 0 || addedCount > 0;

  return (
    <div className="abstract-diff">

      {/* ── Summary bar ───────────────────────────────────────── */}
      <div
        className="diff-summary"
        onClick={() => setCollapsed(v => !v)}
        style={{ cursor: "pointer" }}
      >
        {!diffActive ? (
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Click <strong>Run Diff</strong> to compare abstracts, or <strong>✏ Edit</strong> to paste a corrected PDF abstract first
          </span>
        ) : !diffs ? (
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
            No abstracts available to compare
          </span>
        ) : !hasIssues ? (
          <span className="diff-ok">✓ Abstracts match word-for-word</span>
        ) : (
          <>
            {removedCount > 0 && (
              <span className="diff-removed-count">
                ✗ {removedCount} token{removedCount > 1 ? "s" : ""} in XML missing from PDF
              </span>
            )}
            {addedCount > 0 && (
              <span className="diff-added-count">
                + {addedCount} token{addedCount > 1 ? "s" : ""} in PDF not in XML
              </span>
            )}
          </>
        )}
        {spacingIssues.length > 0 && (
          <span className="diff-spacing-count">
            ⚠ {spacingIssues.length} spacing issue{spacingIssues.length > 1 ? "s" : ""}
          </span>
        )}
        {abstractSupSub.length > 0 && (
          <span className="diff-sup-count">
            🔬 {abstractSupSub.length} sup/sub marker{abstractSupSub.length > 1 ? "s" : ""}
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.6 }}>
          {collapsed ? "▼ Show diff" : "▲ Hide diff"}
        </span>
      </div>

      {!collapsed && (
        <>
          {/* ── Stacked panels ────────────────────────────────── */}
          <div className="diff-panels-stacked">

            {/* XML panel — switches to diff-only view when Run Diff is active */}
            <div className="diff-panel">
              <div className="diff-panel-label xml-label">
                📄 XML Abstract
                {diffActive && diffs ? (
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#1d4ed8", opacity: 0.7, marginLeft: 4 }}>
                    diff view — <span style={{ color: "#991b1b" }}>strikethrough</span> = not in PDF
                  </span>
                ) : null}
                {diffActive && diffs && removedCount > 0 && (
                  <span className="diff-legend diff-legend-removed" style={{ marginLeft: "auto" }}>
                    <span className="diff-legend-swatch removed" /> {removedCount} token{removedCount !== 1 ? "s" : ""} missing
                  </span>
                )}
              </div>

              {/* When diff is active: show word-diff tokens only (compact, focused) */}
              {diffActive && diffs ? (
                <div className="diff-text">
                  <DiffTokens parts={xmlParts} highlightProp="removed" />
                </div>
              ) : (
                /* Normal view: full rich formatted text with sup/sub */
                xmlDisplayHtml ? (
                  <div
                    className="diff-text diff-text-rich"
                    dangerouslySetInnerHTML={{ __html: xmlDisplayHtml }}
                  />
                ) : (
                  <div className="diff-text">
                    <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                      {xmlAbstract || "Not found"}
                    </span>
                  </div>
                )
              )}
            </div>

            {/* PDF panel — editable */}
            <div className="diff-panel">
              <div className="diff-panel-label pdf-label" style={{ alignItems: "center" }}>
                <span>
                  📃 PDF Abstract
                  {manualPdf !== null && (
                    <span style={{
                      fontSize: 10.5, fontWeight: 600, color: "#7c3aed",
                      background: "#ede9fe", borderRadius: 8,
                      padding: "1px 7px", marginLeft: 7, verticalAlign: "middle",
                    }}>manually edited</span>
                  )}
                </span>
                {addedCount > 0 && !isEditing && (
                  <span className="diff-legend diff-legend-added" style={{ marginRight: "auto" }}>
                    <span className="diff-legend-swatch added" /> extra vs XML
                  </span>
                )}
                <span style={{ flex: 1 }} />
                {/* Diff + Edit controls */}
                {!isEditing && (
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    {!diffActive ? (
                      <button
                        onClick={e => { e.stopPropagation(); setDiffActive(true); }}
                        style={btnStyle("#16a34a", true)}
                        title="Compare XML and PDF abstracts word-by-word"
                      >▶ Run Diff</button>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); setDiffActive(false); }}
                        style={btnStyle("#64748b")}
                        title="Hide diff highlighting"
                      >✕ Clear Diff</button>
                    )}
                    <button onClick={e => { e.stopPropagation(); startEdit(); }} style={btnStyle("#6366f1")}>
                      ✏ Edit
                    </button>
                    {manualPdf !== null && (
                      <button onClick={e => { e.stopPropagation(); resetToParser(); }} style={btnStyle("#64748b")}>
                        ↩ Reset to parsed
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Editing mode: textarea + apply/cancel */}
              {isEditing ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 11.5, color: "#64748b", padding: "2px 0" }}>
                    The parser may have captured the wrong section. Clear this box, paste the correct
                    abstract from the PDF, then click <strong>Run Diff</strong>.
                  </div>
                  <textarea
                    value={editDraft}
                    onChange={e => setEditDraft(e.target.value)}
                    rows={8}
                    style={{
                      width: "100%", padding: "8px 10px", borderRadius: 8,
                      border: "1px solid #6366f1", fontFamily: "inherit",
                      fontSize: 13, lineHeight: 1.6, resize: "vertical",
                      outline: "none", boxSizing: "border-box",
                    }}
                    placeholder="Paste the PDF abstract here…"
                    autoFocus
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={applyEdit} style={btnStyle("#16a34a", true)}>
                      ▶ Run Diff
                    </button>
                    <button onClick={cancelEdit} style={btnStyle("#64748b")}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="diff-text">
                  {diffs
                    ? <DiffTokens parts={pdfParts} highlightProp="added" />
                    : effectivePdf
                      ? <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>{effectivePdf}</span>
                      : <span style={{ color: "#94a3b8", fontStyle: "italic", fontSize: 13 }}>
                          No PDF abstract extracted — click <strong>✏ Edit</strong> to paste one manually.
                        </span>
                  }
                </div>
              )}
            </div>

          </div>

          {/* ── Spacing issues ─────────────────────────────────── */}
          {spacingIssues.length > 0 && (
            <div className="diff-issues-box">
              <div className="diff-box-title">⚠ Spacing / Punctuation Issues</div>
              {spacingIssues.map((issue, i) => (
                <div key={i} className="diff-issue-row">
                  <span className={`diff-issue-label ${issue.label.toLowerCase()}`}>{issue.label}</span>
                  {issue.msg}
                </div>
              ))}
            </div>
          )}

          {/* ── Sup / Sub warnings ─────────────────────────────── */}
          {abstractSupSub.length > 0 && (
            <div className="diff-sup-box">
              <div className="diff-box-title">
                🔬 Superscript / Subscript in XML — verify against PDF manually
              </div>
              <div className="diff-sup-list">
                {abstractSupSub.map((token, i) => (
                  <span key={i} className={`diff-${token.type}-token`}>
                    <span className="diff-token-type">{token.type}</span>
                    {token.type === "sup"
                      ? <sup className="diff-token-value">{token.value}</sup>
                      : <sub className="diff-token-value">{token.value}</sub>
                    }
                  </span>
                ))}
              </div>
              <p className="diff-sup-note">
                PDF text extraction strips formatting — the above characters appear as plain text
                in the PDF panel. Check the original PDF visually to confirm correct positioning.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function btnStyle(color, bold = false) {
  return {
    padding: "3px 10px", fontSize: 11.5, cursor: "pointer", borderRadius: 6,
    border: `1px solid ${color}`, background: bold ? color : "transparent",
    color: bold ? "#fff" : color, fontWeight: 600,
  };
}
