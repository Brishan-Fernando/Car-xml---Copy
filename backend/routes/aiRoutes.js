const express = require("express");
const router = express.Router();

const { askAI, explainComparisonIssue } = require("../engines/aiEngine");

/**
 * Extract and validate the Gemini API key from the request.
 * Priority: x-gemini-key header  →  GEMINI_API_KEY env var
 * Returns the key string, or null if neither is available.
 *
 * Note: Google periodically changes their API key format.
 * We only do a minimum-length sanity check — no prefix assumption.
 */
function resolveApiKey(req) {
  const headerKey = (req.headers["x-gemini-key"] || "").trim();

  if (headerKey) {
    // Reject obviously invalid (empty / too short) values
    if (headerKey.length < 20) return null;
    return headerKey;
  }

  return process.env.GEMINI_API_KEY || null;
}

// GET /api/ai/ask — health check
router.get("/ask", (req, res) => {
  res.send("AI route working. Use POST.");
});

// POST /api/ai/ask
router.post("/ask", async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: "Question required" });

    const apiKey = resolveApiKey(req);
    if (!apiKey) {
      return res.status(400).json({
        error: "No Gemini API key configured. Set your key via the 🔑 AI Key button in the workspace.",
      });
    }

    const answer = await askAI(question, apiKey);
    res.json({ answer });
  } catch (error) {
    console.error("AI ask error:", error.message);
    res.status(500).json({ error: "AI failed to respond. Please try again." });
  }
});

// POST /api/ai/explain-issue
router.post("/explain-issue", async (req, res) => {
  try {
    const payload = req.body;
    if (!payload || !payload.comparisonItem) {
      return res.status(400).json({ error: "comparisonItem missing" });
    }

    const apiKey = resolveApiKey(req);
    if (!apiKey) {
      return res.status(400).json({
        error: "No Gemini API key configured. Set your key via the 🔑 AI Key button in the workspace.",
      });
    }

    const explanation = await explainComparisonIssue(payload, apiKey);
    res.json({ explanation });
  } catch (error) {
    console.error("Explain route error:", error.message);
    res.status(500).json({ error: "AI could not explain this issue. Please try again." });
  }
});

module.exports = router;
