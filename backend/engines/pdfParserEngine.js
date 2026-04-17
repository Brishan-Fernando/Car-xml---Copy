const fs = require("fs");
const pdfParse = require("pdf-parse");

// ─── MAIN ENTRY POINT ─────────────────────────────────────────────────────────
async function parsePDF(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    const text = data.text || "";

    // Detect publisher from content to tune extraction
    const publisher = detectPublisher(text);

    return {
      title:      extractTitle(text, publisher),
      abstract:   extractAbstract(text),
      keywords:   extractKeywords(text),
      references: extractReferences(text),
      grants:     extractGrants(text),
      publisher,          // useful for debugging
      fullText:   text,
    };
  } catch (error) {
    console.error("PDF parsing error:", error);
    return { title: null, abstract: null, keywords: [], references: [], grants: null, fullText: "" };
  }
}

module.exports = parsePDF;

// ─── PUBLISHER DETECTION ──────────────────────────────────────────────────────
// Identify publisher so we can tune heuristics. Falls back to "generic".
function detectPublisher(text) {
  const t = text.toLowerCase();
  if (t.includes("oxford university press") || t.includes("jaoacint") || t.includes("journal of aoac")) return "oxford";
  if (t.includes("ieee") || t.includes("institute of electrical and electronics")) return "ieee";
  if (t.includes("world scientific") || t.includes("worldscientific")) return "worldscientific";
  if (t.includes("elsevier") || t.includes("sciencedirect")) return "elsevier";
  if (t.includes("springer") || t.includes("springerlink")) return "springer";
  if (t.includes("wiley") || t.includes("wileyonlinelibrary")) return "wiley";
  return "generic";
}

// ─── NOISE PATTERNS ───────────────────────────────────────────────────────────
// Lines that should NEVER be treated as title, abstract, or content.
const GLOBAL_NOISE = [
  /^received\b/i,
  /^revised\b/i,
  /^accepted\b/i,
  /^advance access publication date\b/i,
  /published by/i,
  /oxford university press/i,
  /sciencedirect/i,
  /elsevier/i,
  /springer/i,
  /^wiley\b/i,
  /^doi[:\s]/i,
  /^https?:\/\/doi\.org/i,
  /^issn\b/i,
  /^©/,
  /creative commons/i,
  /open access/i,
  /rightslink/i,
  /reprints?/i,
  /journals\.permissions/i,
  /all rights reserved/i,
  /for commercial re-use/i,
  /permissions link/i,
];

function isGlobalNoise(line) {
  return GLOBAL_NOISE.some(re => re.test(line));
}

// Section heading patterns – stop title search if we hit these
const SECTION_HEADINGS = [
  /^abstract\b/i,
  /^summary\b/i,
  /^synopsis\b/i,
  /^keywords?\b/i,
  /^key words\b/i,
  /^index terms\b/i,
  /^introduction\b/i,
  /^background\b/i,
  /^methods?\b/i,
  /^experimental\b/i,
  /^results?\b/i,
  /^conclusions?\b/i,
  /^references?\b/i,
  /^bibliography\b/i,
  /^acknowledgments?\b/i,
  /^funding\b/i,
  /^highlights?\b/i,
];

function isSectionHeading(line) {
  return SECTION_HEADINGS.some(re => re.test(line));
}

// ─── TITLE EXTRACTION ─────────────────────────────────────────────────────────
/**
 * Strategy:
 * 1. Find the first "section category" line (e.g. "Animal Food, Pet Food…") and skip it.
 * 2. Then collect consecutive non-noise, non-author, non-heading lines as the title.
 * 3. Stop when we hit an author line, section heading, or have enough text.
 */
function extractTitle(text, publisher) {
  const lines = text
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  // Only look in the first 50 lines
  const searchLines = lines.slice(0, 50);

  const titleLines = [];
  let categorySkipped = false;  // skip only the FIRST category line
  let collecting = false;

  for (let i = 0; i < searchLines.length; i++) {
    const line = searchLines[i];

    // Hard stops
    if (isGlobalNoise(line)) continue;
    if (isSectionHeading(line)) break;
    if (line.length < 8) continue;

    // Skip journal header lines
    if (/^journal of /i.test(line) || /^https?:\/\//.test(line)) continue;
    // Skip lines that are just numbers, symbols, or very short artifacts
    if (/^[^a-zA-Z]*$/.test(line)) continue;

    if (isAuthorOrAffiliationLine(line)) {
      if (collecting) break;
      continue;
    }

    // Skip the first category-like line (e.g. "Animal Food, Pet Food, and Plant Nutrients")
    if (!collecting && !categorySkipped && looksLikeCategoryLine(line)) {
      categorySkipped = true;
      continue;
    }

    titleLines.push(line);
    collecting = true;

    // Stop collecting once we have a reasonable title length and natural line ending
    const joined = titleLines.join(" ");
    if (joined.length > 40 && i + 1 < searchLines.length) {
      const nextLine = searchLines[i + 1];
      // If next line looks like an author or affiliation, we're done
      if (isAuthorOrAffiliationLine(nextLine) || /^[^a-zA-Z]{0,3}$/.test(nextLine)) break;
      if (joined.length > 160) break;
    }
  }

  if (!titleLines.length) return null;

  let title = titleLines.join(" ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();

  return title || null;
}

function looksLikeCategoryLine(line) {
  if (line.length > 90) return false;
  if (/\.$/.test(line)) return false;   // ends with period → probably a sentence
  if (/\b(the|this|we|our|an|a)\b/i.test(line)) return false;  // article words → not category

  // Title-case: most words start with capital
  const words = line.split(/\s+/).filter(w => w.length > 3);
  const capitalised = words.filter(w => /^[A-Z]/.test(w));
  return words.length > 0 && capitalised.length / words.length >= 0.6;
}

function isAuthorOrAffiliationLine(line) {
  if (/@/.test(line)) return true;
  if (/^corresponding author/i.test(line)) return true;
  if (/\bet al\b/i.test(line)) return true;

  // Affiliation keywords
  if (/\b(university|institute|department|laboratory|college|school|center|centre|hospital|clinic|road|avenue|suite|street|united states|usa|uk|china|india|japan|germany|france)\b/i.test(line)) {
    return true;
  }

  // Author name patterns: "Samuel D. Forrest" or "S.D. Forrest"
  if (/\b[A-Z]\.[A-Z]\.\s+[A-Z][a-z]+/.test(line)) return true;  // S.D. Forrest
  if (/\b[A-Z][a-z]+\s+[A-Z]\.\s+[A-Z][a-z]+/.test(line)) return true;  // Samuel D. Forrest

  return false;
}

// ─── ABSTRACT EXTRACTION ──────────────────────────────────────────────────────
/**
 * Finds the "Abstract" heading and collects text until the next major section.
 * Handles both plain paragraphs and structured sub-sections (Background/Objective/…).
 */
function extractAbstract(text) {
  // Match "Abstract" heading (possibly with colon or whitespace after)
  const abstractStart = /\b(abstract|summary|synopsis)\b[\s:.-]*/i;

  // These signal the end of the abstract section
  const abstractEnd = /^(keywords?|key words|index terms|introduction|experimental|methods?|materials and methods|1\.|references|bibliography|highlights?)\b/i;

  const lines = text.split("\n").map(l => l.trim());

  let inAbstract = false;
  const abstractLines = [];

  for (const line of lines) {
    if (!inAbstract) {
      if (abstractStart.test(line)) {
        inAbstract = true;
        // If the abstract heading line also contains text after it, capture that too
        const afterHeading = line.replace(abstractStart, "").trim();
        if (afterHeading) abstractLines.push(afterHeading);
      }
      continue;
    }

    // Stop conditions
    if (abstractEnd.test(line)) break;
    if (isGlobalNoise(line)) continue;
    if (line.length < 3) continue;

    abstractLines.push(line);
  }

  if (!abstractLines.length) return null;

  return cleanText(abstractLines.join(" "));
}

// ─── KEYWORD EXTRACTION ───────────────────────────────────────────────────────
function extractKeywords(text) {
  // Match keyword section heading
  const kwMatch = text.match(
    /\b(keywords?|key words|index terms)\b[\s:.-]*([\s\S]*?)(?=\n\s*\n|\b(introduction|experimental|methods?|materials and methods|1\.|references|bibliography|appendix)\b)/i
  );

  if (!kwMatch) return [];

  const raw = cleanText(kwMatch[2]);

  return raw
    .replace(/\n/g, ", ")
    .split(/[,;•·]/)
    .map(k => k.trim())
    .filter(k => k.length > 1 && k.length < 120);
}

// ─── REFERENCE EXTRACTION ─────────────────────────────────────────────────────
/**
 * Finds the References section and groups individual references.
 * Handles:
 *   [1] Author...         ← IEEE style
 *   1. Author...          ← Oxford/AOAC numbered style
 *   Author, A. (year)...  ← APA/Harvard style
 */
function extractReferences(text) {
  const startRegex = /^\s*(references|bibliography|reference list|works cited|literature cited|notes|list of cited references)\s*$/i;

  const stopRegex = /^\s*(appendix|acknowledg(e)?ments?|funding|financial disclosure|conflict of interest|author contributions?|biograph(y|ies)|supplementary material)\s*$/i;

  const lines = text.split("\n").map(l => l.trim());

  let start = -1;
  let end = lines.length;

  for (let i = 0; i < lines.length; i++) {
    if (start === -1 && startRegex.test(lines[i])) {
      start = i + 1;
      continue;
    }
    if (start !== -1 && stopRegex.test(lines[i])) {
      end = i;
      break;
    }
  }

  if (start === -1) return [];

  const refLines = lines
    .slice(start, end)
    .filter(l => l.length > 0)
    .filter(l => !isRefNoise(l));

  return groupReferences(refLines);
}

function groupReferences(lines) {
  const refs = [];
  let current = "";

  for (const line of lines) {
    if (startsNewReference(line)) {
      if (current.trim()) refs.push(cleanText(current));
      current = line;
    } else {
      current += " " + line;
    }
  }
  if (current.trim()) refs.push(cleanText(current));

  return refs
    .map(r => trimRefTail(r))
    .filter(r => r.length > 20);
}

/**
 * Detect whether a line starts a new reference entry.
 * Handles IEEE [1], Oxford "1.", and APA/Harvard name-first styles.
 */
function startsNewReference(line) {
  return (
    /^\[\d+\]/.test(line) ||            // [1] IEEE
    /^\d+\.\s*[A-Z(]/.test(line) ||      // 1. Oxford
    /^\d+\s+[A-Z]/.test(line) ||        // 1 Oxford (no dot)
    /^[A-Z][a-zA-Z'\-]+,\s+[A-Z]/.test(line) ||  // Surname, I.
    /^[A-Z][a-zA-Z'\-]+\s+[A-Z]\./.test(line)    // Surname I.
  );
}

function isRefNoise(line) {
  if (/^[A-Za-z][A-Za-z &]+|s*d+$/.test(line)) return true;
  if (/^d{3,4}$/.test(line)) return true;
  return (
    /creative commons/i.test(line) ||
    /open access/i.test(line) ||
    /published by/i.test(line) ||
    /oxford university press/i.test(line) ||
    /rightslink/i.test(line) ||
    /all rights reserved/i.test(line) ||
    /the author\(s\)/i.test(line) ||
    /journals\.permissions/i.test(line) ||
    /^https?:\/\/creativecommons\.org/i.test(line) ||
    /^short communication$/i.test(line) ||
    /^received\b/i.test(line) ||
    /^accepted\b/i.test(line) ||
    /^advance access publication date\b/i.test(line) ||
    /^journal of /i.test(line) ||
    /^https?:\/\/doi\.org/i.test(line)
  );
}

function trimRefTail(ref) {
  const tailMarkers = [
    /©\s*the author\(s\)/i,
    /published by/i,
    /oxford university press/i,
    /creative commons/i,
    /open access/i,
    /rightslink/i,
    /all rights reserved/i,
    /^short communication/i,
    /advance access publication date/i,
    /^received\b/i,
    /^accepted\b/i,
  ];

  let cutIndex = ref.length;
  for (const marker of tailMarkers) {
    const idx = ref.search(marker);
    if (idx !== -1 && idx < cutIndex) cutIndex = idx;
  }
  return ref.substring(0, cutIndex).replace(/\s+/g, " ").trim();
}

// ─── GRANT / FUNDING EXTRACTION ───────────────────────────────────────────────
/**
 * Extracts the full Acknowledgments / Funding section text.
 * Returns the raw block of text (proofreaders can verify manually).
 */
function extractGrants(text) {
  // Try to find a named section
  const sectionMatch = text.match(
    /\b(acknowledg(e)?ments?|funding|financial support|grant information|source of funding)\b[\s:.-]*([\s\S]*?)(?=\n\s*\n(?:[A-Z]|\d)|\b(conflict of interest|references|bibliography|author contributions?|appendix)\b)/i
  );

  if (sectionMatch) {
    const block = cleanText(sectionMatch[0]);
    if (block.length > 20) return block;
  }

  // Fallback: look for inline grant sentences
  const inlinePatterns = [
    /this (work|study|research) was (supported|funded|sponsored) by[\s\S]*?(?=\.\s)/i,
    /funded by[\s\S]*?(?=\.\s)/i,
    /supported by[\s\S]*?(?=\.\s)/i,
    /grant[\s\S]{0,200}?(?:number|no\.?|#)\s*[A-Z0-9\-]+/i,
  ];

  for (const pattern of inlinePatterns) {
    const match = text.match(pattern);
    if (match) return cleanText(match[0]);
  }

  return null;
}

// ─── TEXT CLEANUP ─────────────────────────────────────────────────────────────
function cleanText(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}