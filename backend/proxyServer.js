/**
 * proxyServer.js — Bing proxy on port 5001
 *
 * Uses Node's built-in https module instead of http-proxy-middleware so DNS
 * resolution goes through the OS resolver (same as the browser), avoiding the
 * ENOTFOUND errors that some versions of the middleware produce.
 */
const express = require("express");
const https   = require("https");
const http    = require("http");

const proxyApp = express();

const BLOCKED_REQ_HEADERS  = new Set(["host", "x-forwarded-for", "x-forwarded-proto", "x-forwarded-host"]);
const BLOCKED_RES_HEADERS  = new Set(["x-frame-options", "content-security-policy", "content-security-policy-report-only"]);

proxyApp.use("/", (req, res) => {
  const options = {
    hostname: "www.bing.com",
    port:     443,
    path:     req.url,
    method:   req.method,
    family:   4,   // force IPv4 — avoids ENOTFOUND on some networks
    headers:  {
      "host":            "www.bing.com",
      "user-agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "accept":          req.headers["accept"] || "text/html,application/xhtml+xml,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "accept-encoding": req.headers["accept-encoding"] || "gzip, deflate, br",
      // Force English market via cookie — overrides IP-based locale detection
      // _EDGE_S = Bing session cookie that controls market/language
      "cookie": "_EDGE_S=mkt=en-us; _EDGE_V=1; MUIDB=en-US",
    },
  };

  const proxyReq = https.request(options, (proxyRes) => {
    // Build clean response headers
    const outHeaders = {};
    for (const [key, val] of Object.entries(proxyRes.headers)) {
      if (BLOCKED_RES_HEADERS.has(key.toLowerCase())) continue;
      outHeaders[key] = val;
    }

    // Fix Set-Cookie: remove Secure flag + Domain so cookies work on http://localhost
    if (outHeaders["set-cookie"]) {
      const cookies = Array.isArray(outHeaders["set-cookie"])
        ? outHeaders["set-cookie"]
        : [outHeaders["set-cookie"]];
      outHeaders["set-cookie"] = cookies.map(c =>
        c.replace(/;\s*secure/gi, "").replace(/;\s*domain=[^;]*/gi, "")
      );
    }

    res.writeHead(proxyRes.statusCode || 200, outHeaders);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    console.error("[BingProxy]", err.message);
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("Proxy error: " + err.message);
    }
  });

  // Forward request body (POST, etc.)
  req.pipe(proxyReq, { end: true });
});

const PORT = process.env.PROXY_PORT || 5001;
proxyApp.listen(PORT, () =>
  console.log(`Bing proxy  →  http://localhost:${PORT}`)
);

module.exports = proxyApp;
