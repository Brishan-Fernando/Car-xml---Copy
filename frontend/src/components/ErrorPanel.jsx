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

    // Read key from session — never from a hardcoded value
    const apiKey = sessionStorage.getItem("car_gemini_apikey") || "";

    try {
      const res = await fetch("http://localhost:5000/api/ai/explain-issue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey && { "x-gemini-key": apiKey }),
        },
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
      setAiExplanations((prev) => ({
        ...prev,
        [index]: data.explanation || data.error || "No explanation returned.",
      }));
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
          {infos.map((item, i) => (
            <div key={`info-${i}`} className="wb-issue-row">
              <span className="wb-issue-badge badge-info">{statusLabel("info")}</span>
              <span className="wb-issue-field">{item.field}</span>
              <span className="wb-issue-msg">{item.message}</span>
            </div>
          ))}

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
