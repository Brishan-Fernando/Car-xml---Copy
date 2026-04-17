const stringSimilarity = require("string-similarity");

function compareXMLPDF(xmlData, pdfData) {
  const results = [];

  // ── TITLE ──────────────────────────────────────────────────────────────────
  if (xmlData.title && pdfData.title) {
    const score = stringSimilarity.compareTwoStrings(
      normalize(xmlData.title),
      normalize(pdfData.title)
    );
    if (score >= 0.92) {
      results.push({ field: "Title", status: "match", message: "Titles match", xml: xmlData.title, pdf: pdfData.title });
    } else if (score >= 0.75) {
      results.push({ field: "Title", status: "warning", message: `Titles are similar but differ slightly (${pct(score)}% match)`, xml: xmlData.title, pdf: pdfData.title });
    } else {
      results.push({ field: "Title", status: "mismatch", message: `Titles differ significantly (${pct(score)}% match)`, xml: xmlData.title, pdf: pdfData.title });
    }
  }

  // ── AUTHORS ────────────────────────────────────────────────────────────────
  if (xmlData.authors && xmlData.authors.length > 0 && pdfData.fullText) {
    const pdfLower = pdfData.fullText.toLowerCase();
    const notFound = [];

    xmlData.authors.forEach(author => {
      const given = (author.givenName || "").trim();
      const surname = (author.surname || "").trim();
      const initials = (author.initials || "").replace(/\./g, "").trim();

      if (!given && !surname) return;

      const candidates = [
        `${given} ${surname}`,
        `${surname} ${given}`,
        `${surname} ${initials}`,
        `${initials} ${surname}`,
        `${surname}, ${given}`,
        `${surname}, ${initials}`,
      ].map(c => c.toLowerCase().replace(/\s+/g, " ").trim()).filter(c => c.length > 2);

      const found = candidates.some(c => pdfLower.includes(c));
      if (!found) notFound.push(`${given} ${surname}`.trim());
    });

    if (notFound.length === 0) {
      results.push({ field: "Authors", status: "match", message: "All authors found in PDF" });
    } else if (notFound.length <= Math.ceil(xmlData.authors.length / 2)) {
      results.push({ field: "Authors", status: "warning", message: `Some authors not clearly found in PDF: ${notFound.join(", ")}` });
    } else {
      results.push({ field: "Authors", status: "mismatch", message: `Most authors not found in PDF: ${notFound.join(", ")}` });
    }
  }

  // ── ABSTRACT ───────────────────────────────────────────────────────────────
  if (xmlData.abstract && pdfData.abstract) {
    const xmlAbs = normalize(xmlData.abstract).substring(0, 400);
    const pdfAbs = normalize(pdfData.abstract).substring(0, 400);
    const score = stringSimilarity.compareTwoStrings(xmlAbs, pdfAbs);

    if (score >= 0.85) {
      results.push({ field: "Abstract", status: "match", message: "Abstracts match" });
    } else if (score >= 0.70) {
      results.push({ field: "Abstract", status: "warning", message: `Abstracts are similar but differ (${pct(score)}% match)`, xml: xmlData.abstract?.substring(0, 120) + "...", pdf: pdfData.abstract?.substring(0, 120) + "..." });
    } else {
      results.push({ field: "Abstract", status: "mismatch", message: `Abstracts differ significantly (${pct(score)}% match)`, xml: xmlData.abstract?.substring(0, 120) + "...", pdf: pdfData.abstract?.substring(0, 120) + "..." });
    }
  }

  // ── REFERENCES — always info, never error ──────────────────────────────────
  if (xmlData.references && pdfData.references) {
    const xmlCount = xmlData.references.length;
    const pdfCount = pdfData.references.length;
    results.push({
      field: "References",
      status: "info",
      message: `XML has ${xmlCount} references | PDF extracted ${pdfCount} — PDF count may be incomplete due to formatting`,
      xml: String(xmlCount),
      pdf: String(pdfCount),
    });
  }

  // ── KEYWORDS ───────────────────────────────────────────────────────────────
  if (xmlData.keywords && xmlData.keywords.length > 0 && pdfData.fullText) {
    const pdfLower = pdfData.fullText.toLowerCase();
    const missing = xmlData.keywords.filter(kw => !pdfLower.includes(kw.toLowerCase().trim()));

    if (missing.length === 0) {
      results.push({ field: "Keywords", status: "match", message: "All keywords found in PDF" });
    } else if (missing.length <= Math.ceil(xmlData.keywords.length / 2)) {
      results.push({ field: "Keywords", status: "warning", message: `Some keywords not found in PDF: ${missing.join(", ")}` });
    } else {
      results.push({ field: "Keywords", status: "mismatch", message: `Most keywords not found in PDF: ${missing.join(", ")}` });
    }
  }

  // ── AFFILIATIONS ───────────────────────────────────────────────────────────
  if (xmlData.affiliations && xmlData.affiliations.length > 0 && pdfData.fullText) {
    const pdfLower = pdfData.fullText.toLowerCase();
    const stopWords = new Set(["of", "the", "and", "for", "a", "in", "at", "to"]);
    const notFound = [];

    xmlData.affiliations.forEach(aff => {
      const org = aff.organization || "";
      if (!org) return;

      const words = org.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
      if (words.length === 0) return;

      const matchedCount = words.filter(w => pdfLower.includes(w)).length;
      const ratio = matchedCount / words.length;
      if (ratio < 0.6) notFound.push(org);
    });

    if (notFound.length === 0) {
      results.push({ field: "Affiliations", status: "match", message: "All affiliations found in PDF" });
    } else if (notFound.length <= Math.ceil(xmlData.affiliations.length / 2)) {
      results.push({ field: "Affiliations", status: "warning", message: `Some affiliations not clearly found in PDF: ${notFound.join(" | ")}` });
    } else {
      results.push({ field: "Affiliations", status: "mismatch", message: `Most affiliations not found in PDF: ${notFound.join(" | ")}` });
    }
  }

  // ── GRANTS ─────────────────────────────────────────────────────────────────
  if (xmlData.grants && xmlData.grants.length > 0) {
    if (!pdfData.grants) {
      results.push({ field: "Grants", status: "warning", message: "Grant information present in XML but could not be extracted from PDF — verify manually" });
    } else {
      results.push({ field: "Grants", status: "match", message: "Grant section found in both XML and PDF" });
    }
  }

  return results;
}

function normalize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pct(score) {
  return Math.round(score * 100);
}

module.exports = compareXMLPDF;
