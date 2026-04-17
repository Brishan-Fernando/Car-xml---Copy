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

    // Read key from session — never from a hardcoded value
    const apiKey = sessionStorage.getItem("car_gemini_apikey") || "";

    try {
      const res = await fetch("http://localhost:5000/api/ai/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Only attach header when key exists — backend falls back to env var otherwise
          ...(apiKey && { "x-gemini-key": apiKey }),
        },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      if (data.error) {
        setAnswer(`⚠ ${data.error}`);
      } else {
        setAnswer(data.answer || "No answer returned.");
      }
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
