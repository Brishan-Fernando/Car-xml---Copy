import React from "react";
import "./ResultViewer.css";

function ResultViewer({ data }) {
  if (!data) return null;

  const { xml, pdf, comparison } = data;

  return (
    <div className="result-container">
      
      {/* TITLE */}
      <div className="card">
        <h2>Title</h2>
        <p className={comparison.titleMatch ? "match" : "mismatch"}>
          <strong>PDF:</strong> {pdf.title}
        </p>
        <p className={comparison.titleMatch ? "match" : "mismatch"}>
          <strong>XML:</strong> {xml.title}
        </p>
      </div>

      {/* ABSTRACT */}
      <div className="card">
        <h2>Abstract</h2>
        <p>{pdf.abstract || "Not found"}</p>
      </div>

      {/* REFERENCES */}
      <div className="card">
        <h2>References</h2>
        <ul>
          {pdf.references && pdf.references.length > 0 ? (
            pdf.references.map((ref, index) => (
              <li key={index}>{ref}</li>
            ))
          ) : (
            <p>No references found</p>
          )}
        </ul>
      </div>

    </div>
  );
}

export default ResultViewer;