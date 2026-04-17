const express = require("express");
const router  = express.Router();

/**
 * GET /api/search?q=QUERY
 *
 * Fetches results from the DuckDuckGo Instant Answers API (free, no key needed)
 * and returns a clean JSON payload the frontend can render directly.
 *
 * Why server-side? DDG blocks browser fetch() via CORS headers, so we proxy
 * the call through Express and forward just what the UI needs.
 */
router.get("/", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json({ heading: "", abstract: "", abstractUrl: "", results: [], bingUrl: "" });

  const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(q)}`;

  try {
    const ddgUrl =
      `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}` +
      `&format=json&no_redirect=1&no_html=1&kl=en-us&t=car-proofreader`;

    const response = await fetch(ddgUrl, {
      headers: { "User-Agent": "CAR-Proofreader/1.0" },
    });

    if (!response.ok) throw new Error(`DDG API ${response.status}`);
    const data = await response.json();

    // Flatten nested Topics arrays into a single list
    const flatTopics = [];
    for (const item of (data.RelatedTopics || [])) {
      if (item.Topics) {
        flatTopics.push(...item.Topics);        // category group
      } else if (item.FirstURL) {
        flatTopics.push(item);
      }
    }

    const results = flatTopics
      .filter(t => t.FirstURL && t.Text)
      .slice(0, 12)
      .map(t => {
        // Text is often "Title - Description"
        const dash  = t.Text.indexOf(" - ");
        const title   = dash !== -1 ? t.Text.slice(0, dash) : t.Text.slice(0, 80);
        const snippet = dash !== -1 ? t.Text.slice(dash + 3) : "";
        return { title, snippet, url: t.FirstURL };
      });

    return res.json({
      heading:     data.Heading      || "",
      abstract:    data.AbstractText || "",
      abstractUrl: data.AbstractURL  || "",
      entity:      data.Entity       || "",
      results,
      bingUrl,
    });
  } catch (err) {
    console.error("[Search] DDG API error:", err.message);
    // Graceful fallback — frontend can still show the "open in Bing" button
    return res.json({ heading: "", abstract: "", abstractUrl: "", results: [], bingUrl, error: err.message });
  }
});

module.exports = router;
