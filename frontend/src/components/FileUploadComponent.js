import React, { useState, useRef } from "react";
import API from "../services/api";

const styles = {
  wrapper: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
  },
  card: {
    background: "white",
    borderRadius: "24px",
    padding: "48px 40px 40px",
    width: "100%",
    maxWidth: "540px",
    boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
  },
  logo: {
    textAlign: "center",
    marginBottom: "36px",
  },
  logoTitle: {
    fontSize: "24px",
    fontWeight: "700",
    color: "#1e293b",
    margin: "0 0 4px",
  },
  logoSub: {
    fontSize: "14px",
    color: "#64748b",
    margin: 0,
  },
  dropzone: (active, hasFile) => ({
    border: `2px dashed ${active ? "#6366f1" : hasFile ? "#16a34a" : "#cbd5e1"}`,
    borderRadius: "14px",
    padding: "28px 20px",
    textAlign: "center",
    cursor: "pointer",
    background: active ? "#eef2ff" : hasFile ? "#f0fdf4" : "#f8fafc",
    transition: "all 0.2s",
    marginBottom: "14px",
    position: "relative",
  }),
  dropIcon: { fontSize: "32px", marginBottom: "8px" },
  dropLabel: { fontSize: "14px", fontWeight: "600", color: "#1e293b", marginBottom: "4px" },
  dropSub: { fontSize: "12px", color: "#94a3b8" },
  fileName: { fontSize: "13px", color: "#16a34a", fontWeight: "600", marginTop: "8px" },
  hiddenInput: { display: "none" },
  btn: (enabled) => ({
    width: "100%",
    padding: "14px",
    background: enabled
      ? "linear-gradient(135deg, #6366f1, #4f46e5)"
      : "#e2e8f0",
    color: enabled ? "white" : "#94a3b8",
    border: "none",
    borderRadius: "12px",
    fontSize: "15px",
    fontWeight: "700",
    cursor: enabled ? "pointer" : "not-allowed",
    marginTop: "8px",
    transition: "opacity 0.2s",
    letterSpacing: "0.3px",
  }),
  statusRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginTop: "16px",
    padding: "12px 16px",
    background: "#f0f4ff",
    borderRadius: "10px",
    fontSize: "13px",
    color: "#667eea",
    fontWeight: "500",
  },
  spinner: {
    width: "16px", height: "16px",
    border: "2px solid #c7d2fe",
    borderTop: "2px solid #667eea",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
    flexShrink: 0,
  },
};

function DropZone({ label, icon, accept, file, onFile }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };

  return (
    <div
      style={styles.dropzone(dragging, !!file)}
      onClick={() => inputRef.current.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <div style={styles.dropIcon}>{file ? "✅" : icon}</div>
      <div style={styles.dropLabel}>{file ? file.name : label}</div>
      {!file && <div style={styles.dropSub}>Click to browse or drag & drop</div>}
      {file && <div style={styles.fileName}>Ready to upload</div>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={styles.hiddenInput}
        onChange={(e) => onFile(e.target.files[0])}
      />
    </div>
  );
}

function FileUploadComponent({ setResults }) {
  const [xmlFile, setXmlFile] = useState(null);
  const [pdfFile, setPdfFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const ready = xmlFile && pdfFile;

  const handleUpload = async () => {
    if (!ready) return;
    setLoading(true);

    const formData = new FormData();
    formData.append("xml", xmlFile);
    formData.append("pdf", pdfFile);

    try {
      const { data } = await API.post("/upload/files", formData);
      if (setResults) setResults(data);
      // Note: never log 'data' here — it contains parsed file contents
    } catch (error) {
      console.error("Upload error:", error);
      alert("Upload failed. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.wrapper}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={styles.card}>
        <div style={styles.logo}>
          <h1 style={styles.logoTitle}>CAR XML Proofreader</h1>
          <p style={styles.logoSub}>Upload your XML and PDF files to begin validation</p>
        </div>

        <DropZone
          label="Drop your XML file here"
          icon="📄"
          accept=".xml"
          file={xmlFile}
          onFile={setXmlFile}
        />

        <DropZone
          label="Drop your PDF file here"
          icon="📋"
          accept=".pdf"
          file={pdfFile}
          onFile={setPdfFile}
        />

        <button
          style={styles.btn(ready && !loading)}
          onClick={handleUpload}
          disabled={!ready || loading}
        >
          {loading ? "Analysing files..." : "Start Proofreading →"}
        </button>

        {loading && (
          <div style={styles.statusRow}>
            <div style={styles.spinner} />
            Parsing XML and PDF, running comparison...
          </div>
        )}
      </div>
    </div>
  );
}

export default FileUploadComponent;
