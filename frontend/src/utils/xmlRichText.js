/**
 * xmlRichText.js
 *
 * Converts raw XML inline-markup (as returned by the parser for mixed-content
 * nodes) into two usable forms:
 *
 *   html  — safe HTML string with <sup>/<sub> preserved for display
 *   plain — plain text with ALL tags stripped (use for diff algorithms, search)
 *
 * Supported Elsevier CAR XML conventions:
 *   Superscript  →  <ce:sup>  or  <sup>
 *   Subscript    →  <ce:inf>  or  <inf>   (Elsevier uses <inf>, not <sub>)
 *
 * Usage:
 *   import { xmlToHtml, xmlToPlain, xmlRichText } from "../utils/xmlRichText";
 *
 *   const { html, plain } = xmlRichText(someString);
 */

/** Convert XML inline markup → HTML string (sup/sub retained, rest stripped). */
export function xmlToHtml(str) {
  if (!str || typeof str !== "string") return str || "";
  return str
    // Convert Elsevier CE namespace superscript/subscript tags first
    .replace(/<ce:sup[^>]*>([\s\S]*?)<\/ce:sup>/gi, "<sup>$1</sup>")
    .replace(/<ce:inf[^>]*>([\s\S]*?)<\/ce:inf>/gi, "<sub>$1</sub>")
    .replace(/<ce:sub[^>]*>([\s\S]*?)<\/ce:sub>/gi, "<sub>$1</sub>")
    // Convert plain sup/inf/sub tags
    .replace(/<sup[^>]*>([\s\S]*?)<\/sup>/gi,       "<sup>$1</sup>")
    .replace(/<inf[^>]*>([\s\S]*?)<\/inf>/gi,       "<sub>$1</sub>")
    .replace(/<sub[^>]*>([\s\S]*?)<\/sub>/gi,       "<sub>$1</sub>")
    // Strip ALL remaining XML tags — but EXCLUDE the <sup>/<sub> we just produced
    .replace(/<(?!\/?(?:sup|sub)\b)[^>]+>/gi, "")
    .trim();
}

/** Strip ALL XML/HTML tags → plain text (for diff, search, length checks). */
export function xmlToPlain(str) {
  if (!str || typeof str !== "string") return str || "";
  return str.replace(/<[^>]+>/g, "").trim();
}

/** Returns both forms in one call. */
export function xmlRichText(str) {
  return { html: xmlToHtml(str), plain: xmlToPlain(str) };
}
