const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Load manual once at startup — used as system instruction for every askAI call
let manual = "";
try {
  const manualPath = path.join(__dirname, "..", "knowledge", "manual.txt");
  manual = fs.readFileSync(manualPath, "utf-8");
} catch (err) {
  console.error("Could not load manual.txt:", err.message);
}

/**
 * Return a Gemini model instance using the provided key.
 * A new GoogleGenerativeAI instance is created per call so that each
 * request uses whatever key the caller supplies (user key or env fallback).
 * The key is NEVER logged.
 */
function getModel(apiKey, modelOptions) {
  const ai = new GoogleGenerativeAI(apiKey);
  return ai.getGenerativeModel(modelOptions);
}

/** Friendly error messages — never expose the raw SDK error to the client. */
function friendlyError(error) {
  const msg = error.message || "";
  if (msg.includes("Quota") || msg.includes("429") || msg.includes("rate limit")) {
    return "⚠ AI is temporarily busy due to usage limits. Please try again in a few seconds.";
  }
  if (msg.includes("API key") || msg.includes("API_KEY") || msg.includes("403")) {
    return "⚠ Invalid or expired API key. Please update your key via the 🔑 AI Key button.";
  }
  if (msg.includes("SAFETY")) {
    return "⚠ The AI declined to answer due to content safety filters.";
  }
  return "❌ AI failed to respond. Please try again.";
}

/**
 * askAI — answers CAR manual questions.
 * @param {string} question
 * @param {string} apiKey  — caller-supplied key (already validated by the route)
 */
async function askAI(question, apiKey) {
  try {
    const model = getModel(apiKey, {
      model: "gemini-2.5-flash",
      systemInstruction: `You are an expert CAR XML proofreading assistant.
Use the following CAR XML manual as your primary knowledge source.

${manual}

Rules for every answer:
- Be concise and direct (3-6 sentences max unless a list is clearer)
- Say YES or NO when the question is a yes/no question
- If the manual does not clearly support the answer, say so explicitly
- Never make up rules that are not in the manual`,
    });

    const result = await model.generateContent(`Question: ${question}`);
    return result.response.text();
  } catch (error) {
    // Log only the sanitised message — never log the key
    console.error("askAI error:", error.message);
    return friendlyError(error);
  }
}

/**
 * explainComparisonIssue — explains a specific comparison row.123
 * @param {object} payload
 * @param {string} apiKey  — caller-supplied key (already validated by the route)
 */
async function explainComparisonIssue(payload, apiKey) {
  try {
    const model = getModel(apiKey, { model: "gemini-2.5-flash" });

    const prompt = `You are an expert CAR XML proofreading assistant.

A proofreader needs help understanding this validation result. Explain it clearly.

VALIDATION DATA:
${JSON.stringify(payload, null, 2)}

Instructions:
- Explain the issue in simple reviewer-friendly language (2-4 sentences).
- Say whether this looks like a real XML error, a PDF extraction issue, or only a formatting/casing difference.
- Suggest what the reviewer should check or do.`;

    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("explainComparisonIssue error:", error.message);
    return friendlyError(error);
  }
}

module.exports = { askAI, explainComparisonIssue };
