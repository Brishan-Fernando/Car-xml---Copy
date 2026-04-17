import React, { useMemo, useState } from "react";
import { xmlToHtml, xmlToPlain } from "../utils/xmlRichText";

// ── Per-reference issue detector ──────────────────────────────────────────────
function checkReferenceText(rawText) {
  if (!rawText || typeof rawText !== "string") return [];
  // Strip XML tags first so inline markup doesn't cause false positives
  const text = xmlToPlain(rawText);
  const issues = [];

  // Remove URLs before pattern matching to avoid false positives
  const noUrls = text.replace(/https?:\/\/[^\s]+/g, "URL").replace(/doi\.org\/[^\s]+/gi, "URL");

  // 1. Double spaces
  if (/  /.test(text)) {
    const count = (text.match(/ {2,}/g) || []).length;
    issues.push({ type: "spacing", msg: `Double space (${count} occurrence${count > 1 ? "s" : ""})` });
  }

  // 2. Space before punctuation
  if (/ [.,;:](?!\.)/.test(noUrls)) {
    issues.push({ type: "spacing", msg: "Space before punctuation (, . ; :)" });
  }

  // 3. Missing space after comma — skip numbers like "15,3" (vol/issue)
  if (/,[A-Za-z]/.test(noUrls)) {
    issues.push({ type: "spacing", msg: "Missing space after comma" });
  }

  // 4. Missing space after period — uppercase follows directly
  // Remove common abbreviations first to reduce false positives
  const noAbbr = noUrls.replace(
    /\b(?:Vol|vol|pp|p|No|no|ed|eds|et al|e\.g|i\.e|Dr|Mr|Mrs|Ms|Jr|Sr|Fig|Eq|doi|DOI)\./g,
    "ABBR"
  );
  if (/[a-z]\.[A-Z]/.test(noAbbr)) {
    issues.push({ type: "spacing", msg: "Missing space after period" });
  }

  // 5. Trailing whitespace
  if (/\s+$/.test(text)) {
    issues.push({ type: "spacing", msg: "Trailing whitespace" });
  }

  // 6. Consecutive punctuation (ignoring ellipsis)
  const noEllipsis = text.replace(/\.\.\./g, "ELLIPSIS");
  if (/[.,;:]{2,}/.test(noEllipsis)) {
    issues.push({ type: "format", msg: "Consecutive punctuation marks" });
  }

  // 7. Page range with hyphen instead of en-dash
  if (/(?::\s*|pp?\.\s*)\d+\s*-\s*\d+/.test(text)) {
    issues.push({ type: "format", msg: "Page range: use en-dash (–) not hyphen (-)" });
  }

  // 8. DOI with embedded space
  const doiMatch = text.match(/(?:doi|DOI)[:\s]+([^\s]+)/i);
  if (doiMatch && doiMatch[1] && doiMatch[1].includes(" ")) {
    issues.push({ type: "format", msg: "Space found within DOI" });
  }

  // 9. No recognisable publication year
  if (!/\b(19|20)\d{2}\b/.test(text)) {
    issues.push({ type: "missing", msg: "No publication year detected" });
  }

  // 10. Does not end with period (most citation styles require it)
  const trimmed = text.trim();
  if (trimmed && !/[./>]$/.test(trimmed)) {
    issues.push({ type: "format", msg: "Reference does not end with a period" });
  }

  return issues;
}

// ── Cross-reference consistency checker ───────────────────────────────────────
function checkConsistency(references) {
  const issues = [];
  const texts = (references || []).map(r => xmlToPlain(r.displayText || "")).filter(Boolean);
  if (texts.length < 2) return issues;

  // Mixed year position: some (YYYY), some bare YYYY
  const inParens = texts.filter(t => /\(\d{4}\)/.test(t)).length;
  const noParens = texts.filter(t => /\b\d{4}\b/.test(t) && !/\(\d{4}\)/.test(t)).length;
  if (inParens > 0 && noParens > 0) {
    issues.push(
      `Year format inconsistent: ${inParens} reference(s) wrap year in parentheses (YYYY) and ${noParens} do not`
    );
  }

  // Mixed ending punctuation
  const endsWithPeriod = texts.filter(t => /\.\s*$/.test(t)).length;
  const noEndPeriod    = texts.length - endsWithPeriod;
  if (endsWithPeriod > 0 && noEndPeriod > 0) {
    issues.push(
      `Inconsistent endings: ${endsWithPeriod} reference(s) end with a period, ${noEndPeriod} do not`
    );
  }

  return issues;
}

// ── Badge colours ─────────────────────────────────────────────────────────────
const TYPE_COLOR = { spacing: "#f97316", format: "#eab308", missing: "#ef4444" };
const TYPE_ICON  = { spacing: "⎵", format: "⚠", missing: "✗" };

// ── Main component ────────────────────────────────────────────────────────────
export default function ReferenceSpacingChecker({ references, pdfReferenceCount }) {
  const [expanded, setExpanded] = useState(true);
  const [showAll,  setShowAll]  = useState(false);

  const analysed = useMemo(
    () => (references || []).map(ref => ({
      ...ref,
      issues:      checkReferenceText(ref.displayText),
      // Rich HTML from backend if available, else convert inline markup on the fly
      _displayHtml: ref.displayHtml || xmlToHtml(ref.displayText || ""),
    })),
    [references]
  );

  const consistencyIssues = useMemo(() => checkConsistency(references), [references]);

  const totalIssues    = analysed.reduce((s, r) => s + r.issues.length, 0) + consistencyIssues.length;
  const refsWithIssues = analysed.filter(r => r.issues.length > 0).length;
  const displayed      = showAll ? analysed : analysed.slice(0, 10);
  const hasMore        = analysed.length > 10;

  const xmlCount = (references || []).length;
  const countMismatch =
    typeof pdfReferenceCount === "number" && pdfReferenceCount !== xmlCount;

  return (
    <div>

      {/* ── Summary bar ─────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px", borderRadius: 8, marginBottom: 10,
        background: totalIssues === 0 ? "#f0fdf4" : "#fffbeb",
        border: `1px solid ${totalIssues === 0 ? "#bbf7d0" : "#fde68a"}`,
        fontSize: 13,
      }}>
        <span style={{ fontWeight: 700, color: totalIssues === 0 ? "#16a34a" : "#b45309" }}>
          {totalIssues === 0
            ? "✓ No formatting issues found"
            : `⚠ ${totalIssues} issue${totalIssues !== 1 ? "s" : ""} in ${refsWithIssues} of ${xmlCount} reference${xmlCount !== 1 ? "s" : ""}`}
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            background: "none", border: "1px solid #d1d5db", borderRadius: 6,
            padding: "3px 10px", cursor: "pointer", fontSize: 12, color: "#6b7280",
          }}
        >{expanded ? "▲ Collapse" : "▼ Expand"}</button>
      </div>

      {/* ── PDF vs XML reference count ─────────────────────── */}
      {typeof pdfReferenceCount === "number" && (
        <div style={{
          fontSize: 12.5, marginBottom: 10,
          padding: "6px 12px", borderRadius: 8,
          background: countMismatch ? "#fef2f2" : "#f0fdf4",
          border: `1px solid ${countMismatch ? "#fecaca" : "#bbf7d0"}`,
          color: countMismatch ? "#b91c1c" : "#15803d",
          fontWeight: 600,
        }}>
          {countMismatch
            ? `✗ Count mismatch — XML: ${xmlCount} references, PDF extracted: ${pdfReferenceCount}`
            : `✓ Reference count matches — ${xmlCount} in both XML and PDF`}
        </div>
      )}

      {/* ── Cross-reference consistency issues ────────────── */}
      {expanded && consistencyIssues.length > 0 && (
        <div style={{
          marginBottom: 10, padding: "8px 12px", borderRadius: 8,
          background: "#fef3c7", border: "1px solid #fcd34d",
          fontSize: 12.5, color: "#92400e",
        }}>
          <strong>Consistency across references:</strong>
          <ul style={{ margin: "5px 0 0 18px", padding: 0 }}>
            {consistencyIssues.map((issue, i) => <li key={i} style={{ marginBottom: 2 }}>{issue}</li>)}
          </ul>
        </div>
      )}

      {/* ── Per-reference list ────────────────────────────── */}
      {expanded && displayed.map((ref, i) => {
        const hasIssues = ref.issues.length > 0;
        return (
          <div key={i} style={{
            padding: "8px 10px", marginBottom: 5, borderRadius: 8,
            background: hasIssues ? "#fffbeb" : "#f8fafc",
            border: `1px solid ${hasIssues ? "#fde68a" : "#e2e8f0"}`,
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ fontWeight: 700, color: "#64748b", minWidth: 28, flexShrink: 0, fontSize: 12 }}>
                [{ref.seq || i + 1}]
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#1e293b", lineHeight: 1.55, fontSize: 12.5, wordBreak: "break-word" }}>
                  {ref._displayHtml
                    ? <span dangerouslySetInnerHTML={{ __html: ref._displayHtml }} />
                    : <em style={{ color: "#94a3b8" }}>No reference text</em>
                  }
                </div>
                {hasIssues && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                    {ref.issues.map((issue, j) => (
                      <span key={j} style={{
                        fontSize: 11, padding: "2px 7px", borderRadius: 10,
                        background: TYPE_COLOR[issue.type] + "1a",
                        color: TYPE_COLOR[issue.type],
                        border: `1px solid ${TYPE_COLOR[issue.type]}50`,
                        fontWeight: 600,
                      }}>
                        {TYPE_ICON[issue.type]} {issue.msg}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {!hasIssues && (
                <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 700, flexShrink: 0 }}>✓</span>
              )}
            </div>
          </div>
        );
      })}

      {/* ── Show more / less ─────────────────────────────── */}
      {expanded && hasMore && (
        <button
          onClick={() => setShowAll(v => !v)}
          style={{
            display: "block", width: "100%", marginTop: 4, padding: "7px",
            background: "var(--surface-2)", border: "1px solid var(--border)",
            borderRadius: 8, cursor: "pointer", fontSize: 12, color: "var(--text-muted)",
          }}
        >
          {showAll
            ? "▲ Show fewer references"
            : `▼ Show all ${analysed.length} references (${analysed.length - 10} more)`}
        </button>
      )}

    </div>
  );
}
