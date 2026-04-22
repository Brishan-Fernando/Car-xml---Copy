const fs = require("fs");
const { XMLParser } = require("fast-xml-parser");

// ─── PARSER CONFIG ────────────────────────────────────────────────────────────
// isArray ensures these tags are ALWAYS arrays even when only one child exists.
// This prevents fast-xml-parser from collapsing single items into plain objects.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",   // attributes accessible as plain keys (e.g. obj.seq)
  trimValues: true,
  parseTagValue: false,      // keep everything as strings – avoids number coercion
  isArray: (tagName) => {
    const alwaysArray = [
      "author", "affiliation", "correspondence", "reference",
      "grant", "author-keyword", "organization", "titletext",
      "abstract", "author-group", "xref", "ce:cross-ref",
    ];
    return alwaysArray.includes(tagName);
  },
});

// ─── RICH TEXT HELPER ─────────────────────────────────────────────────────────
/**
 * Convert a raw XML fragment to safe HTML, turning superscript/subscript tags
 * into proper <sup>/<sub> elements and stripping all other XML markup.
 *
 * Elsevier CAR XML conventions:
 *   Superscript → <ce:sup> or <sup>
 *   Subscript   → <ce:inf> or <inf>   (NOT <sub> — they use <inf> for subscript)
 */
function xmlFragmentToHtml(str) {
  if (!str || typeof str !== "string") return "";
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

// ─── MAIN ENTRY POINT ─────────────────────────────────────────────────────────
function parseXML(filePath) {
  try {
    const xmlData = fs.readFileSync(filePath, "utf8");
    const json = parser.parse(xmlData);

    // Combined extraction so no-ID affiliations are matched by group membership
    const { affiliations, authors } = extractAuthorsAndAffiliations(json);
    const abstractSupSub  = extractAbstractAnnotations(xmlData);

    const references = extractReferences(json, xmlData);

    const titles = extractTitles(json);

    return {
      title:          titles[0]?.text || null,   // primary title for comparison engine
      titles,                                     // all language variants
      titleLang:      extractTitleLang(titles),   // lang of primary title
      authors,
      affiliations,
      abstractSupSub,
      correspondence: extractCorrespondence(json),
      abstract:       extractAbstract(json),
      abstractHtml:   extractAbstractHtml(xmlData),
      abstractLang:   extractAbstractLang(json),
      keywords:       extractKeywords(json),
      keywordsHtml:   extractKeywordsHtml(xmlData),
      references,
      copyright:      extractCopyright(json),
      grants:         extractGrants(json),
      pages:          extractPages(json),
      raw:            json,
    };
  } catch (error) {
    console.error("XML parsing error:", error);
    return {
      title: null, titles: [], titleLang: null, authors: [], affiliations: [], correspondence: [],
      abstract: null, abstractHtml: null, abstractLang: null, keywords: [], keywordsHtml: [],
      references: [], copyright: null, grants: [], pages: {}, raw: null,
    };
  }
}

module.exports = parseXML;

// ─── GENERIC HELPERS ──────────────────────────────────────────────────────────

/**
 * Walk the entire JSON tree and return the FIRST value found for targetKey.
 */
function findFirstValueByKey(obj, targetKey) {
  if (!obj || typeof obj !== "object") return null;
  if (Object.prototype.hasOwnProperty.call(obj, targetKey)) return obj[targetKey];

  for (const key of Object.keys(obj)) {
    const val = obj[key];
    const found = Array.isArray(val)
      ? val.reduce((r, item) => r ?? findFirstValueByKey(item, targetKey), null)
      : findFirstValueByKey(val, targetKey);
    if (found !== null && found !== undefined) return found;
  }
  return null;
}

/**
 * Walk the entire JSON tree and collect ALL values found for targetKey.
 */
function findAllByKey(obj, targetKey, results = []) {
  if (!obj || typeof obj !== "object") return results;
  if (Object.prototype.hasOwnProperty.call(obj, targetKey)) results.push(obj[targetKey]);

  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (Array.isArray(val)) val.forEach(item => findAllByKey(item, targetKey, results));
    else if (typeof val === "object" && val !== null) findAllByKey(val, targetKey, results);
  }
  return results;
}

/** Ensure value is always an array. */
function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Safely extract a plain-text string from a parsed XML value.
 * Handles: plain strings, numbers, objects with #text, objects with string children.
 */
function getText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);

  if (typeof value === "object") {
    // fast-xml-parser stores mixed content as { "#text": "...", otherAttr: "..." }
    if (value["#text"] !== undefined) return String(value["#text"]).trim();

    // Collect all plain-string children (skips attribute-like keys)
    const parts = Object.keys(value)
      .filter(k => typeof value[k] === "string")
      .map(k => value[k].trim())
      .filter(Boolean);
    return parts.join(" ").trim();
  }
  return "";
}

/**
 * Extract the iso-code attribute 
 */
function getCountryCode(countryNode) {
  if (!countryNode || typeof countryNode !== "object") return "";
  return countryNode["iso-code"] || "";
}

// ─── TITLE ────────────────────────────────────────────────────────────────────
/**
 * Returns every <titletext> entry as { text, lang, original }.
 * The array is sorted so original="y" entries come first, then by lang code.
 * The primary title (first in the sorted array) is still exposed as `title`
 * on the result object for backward-compat with the comparison engine.
 */
function extractTitles(json) {
  const titleTexts = findAllByKey(json, "titletext");
  if (!titleTexts.length) return [];

  const all = titleTexts.flat();
  const titles = [];

  for (const t of all) {
    const text = getText(t);
    if (!text) continue;
    titles.push({
      text,
      lang:     (typeof t === "object" ? t["xml:lang"] : null) || null,
      original: typeof t === "object" && t.original === "y",
    });
  }

  // Original titles first, then alphabetical by lang code
  titles.sort((a, b) => {
    if (a.original !== b.original) return a.original ? -1 : 1;
    return (a.lang || "").localeCompare(b.lang || "");
  });

  return titles;
}

// Keep a thin wrapper for backward-compat (comparison engine uses `title`)
function extractTitle(json) {
  const titles = extractTitles(json);
  return titles[0]?.text || null;
}

// ─── AUTHORS + AFFILIATIONS (combined pass) ───────────────────────────────────
/**
 * Extract authors and affiliations in a single pass through <author-group> nodes.
 *
 * Why combined?
 *   When <affiliation> elements inside a group have NO id attribute, there is no
 *   ID-based link between authors and affiliations. The only correct match is
 *   "every author in this group belongs to every affiliation in this group."
 *   A combined pass lets us build affIdToNum as we process each group and then
 *   immediately assign groupAffNums to authors in the same group — even when no
 *   real IDs exist.
 *
 *   For affiliations without an id we mint a synthetic key (__syn_N) so the
 *   lookup table works, but the stored affiliation retains id: "" so no fake
 *   IDs leak into the UI.
 *
 * Affiliations inside <correspondence> are intentionally excluded; they are
 * handled by extractCorrespondence() and must NOT appear as standalone entries.
 */
function extractAuthorsAndAffiliations(json) {
  const authorGroups = findAllByKey(json, "author-group");
  const affiliations = [];
  const authors      = [];
  const seenIds      = new Set();  // dedup real IDs across groups
  const affIdToNum   = {};         // id → 1-based affiliation number
  let synCounter     = 0;          // counter for synthetic IDs

  for (const groups of authorGroups) {
    for (const group of toArray(groups)) {
      const groupAffNums = []; // affiliation numbers belonging to THIS group

      // ── 1. Process affiliations in this group first ──────────────────────
      for (const aff of toArray(group?.affiliation)) {
        const realId = aff?.id || "";

        if (realId && seenIds.has(realId)) {
          // Affiliation already registered from a previous group — just record its number
          const num = affIdToNum[realId];
          if (num !== undefined) groupAffNums.push(num);
          continue;
        }

        // Mint a synthetic key when there is no real id (used for lookup only)
        const lookupKey = realId || `__syn_${synCounter++}`;
        if (realId) seenIds.add(realId);

        const orgNodes      = toArray(aff?.organization);
        const organizations = orgNodes.map(o => getText(o)).filter(Boolean);
        const countryCode   = getCountryCode(aff?.country);
        const countryText   = getText(aff?.country);
        const num           = affiliations.length + 1;

        affiliations.push({
          id: realId,           // keep original (empty string for no-id affiliations)
          num,                  // 1-based display number
          organizations,
          organization: organizations.join("; "),
          address:     getText(aff?.["address-part"]),
          city:        getText(aff?.city),
          state:       getText(aff?.state),
          postalCode:  getText(aff?.["postal-code"]),
          country:     countryText || countryCode,
          countryCode,
          sourceText:  getText(aff?.["ce:source-text"]),
        });

        affIdToNum[lookupKey] = num;
        groupAffNums.push(num);
      }

      // ── 2. Process authors in this group ─────────────────────────────────
      for (const author of toArray(group?.author)) {
        const crossRefs = toArray(author?.["ce:cross-ref"]);
        const xrefs     = toArray(author?.xref);

        // Collect explicit affiliation xref IDs from the author element
        const explicitIds = [
          ...crossRefs.flatMap(x => String(x?.refid || x?.rid || "").split(/\s+/)),
          ...xrefs
            .filter(x => !x["ref-type"] || x["ref-type"] === "aff" || x["reftype"] === "aff")
            .flatMap(x => String(x?.rid || x?.refid || "").split(/\s+/)),
        ].filter(Boolean);

        // Resolve explicit IDs to numbers; fall back to all group affiliations
        const explicitNums = explicitIds.map(id => affIdToNum[id]).filter(Boolean);
        const affNums      = explicitNums.length ? explicitNums : [...groupAffNums];

        authors.push({
          seq:       author?.seq   || "",
          orcid:     author?.orcid || "",
          initials:  getText(author?.["ce:initials"]),
          degrees:   getText(author?.["ce:degrees"]),
          surname:   getText(author?.["ce:surname"]),
          givenName: getText(author?.["ce:given-name"]),
          suffix:    getText(author?.["ce:suffix"]),
          email:     getText(author?.["ce:e-address"]),
          alias:     getText(author?.["ce:alias"]),
          altName:   getText(author?.["ce:alt-name"]),
          affIds:    explicitIds,  // raw ID strings (kept for compatibility)
          affNums,                 // already-resolved 1-based numbers
        });
      }
    }
  }

  return { affiliations, authors };
}

// ─── CORRESPONDENCE ───────────────────────────────────────────────────────────
function extractCorrespondence(json) {
  const correspondences = findAllByKey(json, "correspondence");
  const result = [];

  for (const corrList of correspondences) {
    for (const corr of toArray(corrList)) {
      const person = corr?.person || {};
      // "affiliation" is in the isArray config → always an array; take the first item
      const aff    = toArray(corr?.affiliation)[0] || null;

      // affiliation inside correspondence (same multi-org fix)
      let corrAff = null;
      if (aff) {
        const orgNodes = toArray(aff.organization);
        const corrOrgs = orgNodes.map(o => getText(o)).filter(Boolean);
        corrAff = {
          organizations: corrOrgs,
          organization: corrOrgs.join("; "),
          address:      getText(aff["address-part"]),
          city:         getText(aff.city),
          state:        getText(aff.state),
          postalCode:   getText(aff["postal-code"]),
          country:      getText(aff.country) || getCountryCode(aff.country),
          countryCode:  getCountryCode(aff.country),
          sourceText:   getText(aff["ce:source-text"]),
        };
      }

      result.push({
        initials:    getText(person?.["ce:initials"]),
        surname:     getText(person?.["ce:surname"]),
        givenName:   getText(person?.["ce:given-name"]),
        email:       getText(corr?.["ce:e-address"]),
        affiliation: corrAff,
      });
    }
  }
  return result;
}

// ─── ABSTRACT SUP/SUB ANNOTATIONS ─────────────────────────────────────────────
// Scans the raw XML string for <sup>/<sub> tags inside the abstract section.
// Returns an array of { value, type: "sup"|"sub" } tokens so the frontend
// can warn the proofreader to verify them against the PDF visually.
function extractAbstractAnnotations(rawXml) {
  const tokens = [];

  // Find the abstract section in raw XML (try multiple wrapper tag names)
  let abstractContent = "";
  for (const pat of [
    /<ce:abstract[^>]*>([\s\S]*?)<\/ce:abstract>/i,
    /<abstract[^>]*>([\s\S]*?)<\/abstract>/i,
  ]) {
    const m = rawXml.match(pat);
    if (m) { abstractContent = m[1]; break; }
  }
  if (!abstractContent) return tokens;

  // Match <ce:sup>, <sup>, <ce:sub>, <sub> tags
  const tagRe = /<(ce:sup|sup|ce:sub|sub)[^>]*>([\s\S]*?)<\/(?:ce:sup|sup|ce:sub|sub)>/gi;
  let m;
  while ((m = tagRe.exec(abstractContent)) !== null) {
    const type    = m[1].toLowerCase().replace("ce:", ""); // "sup" or "sub"
    const content = m[2].replace(/<[^>]+>/g, "").trim();
    if (content) tokens.push({ value: content, type });
  }
  return tokens;
}

// ─── COPYRIGHT ────────────────────────────────────────────────────────────────
function extractCopyright(json) {
  const val = findFirstValueByKey(json, "publishercopyright");
  return getText(val) || null;
}

// ─── LANGUAGE CODES ───────────────────────────────────────────────────────────
// titleLang is now derived from the titles array — kept as a thin helper
// so the parseXML return stays backward-compatible.
function extractTitleLang(titles) {
  return titles[0]?.lang || null;
}

function extractAbstractLang(json) {
  const abstractsNodes = findAllByKey(json, "abstracts");
  for (const node of abstractsNodes) {
    for (const abs of toArray(node?.abstract || node)) {
      if (typeof abs === "object" && abs.original === "y") {
        return abs["xml:lang"] || null;
      }
    }
  }
  // Fallback: look directly at abstract arrays
  const directAbstracts = findAllByKey(json, "abstract");
  for (const list of directAbstracts) {
    for (const abs of toArray(list)) {
      if (typeof abs === "object" && abs.original === "y") {
        return abs["xml:lang"] || null;
      }
    }
  }
  return null;
}

// ─── ABSTRACT HTML (rich: sup/sub preserved) ──────────────────────────────────
function extractAbstractHtml(rawXml) {
  // Find the abstract wrapper (prefer original="y" but accept any)
  let content = "";
  for (const pat of [
    /<ce:abstract\b[^>]*original="y"[^>]*>([\s\S]*?)<\/ce:abstract>/i,
    /<ce:abstract[^>]*>([\s\S]*?)<\/ce:abstract>/i,
    /<abstract\b[^>]*original="y"[^>]*>([\s\S]*?)<\/abstract>/i,
    /<abstract[^>]*>([\s\S]*?)<\/abstract>/i,
  ]) {
    const m = rawXml.match(pat);
    if (m) { content = m[1]; break; }
  }
  if (!content) return null;

  // Find the <ce:para> (or <para>) inside the abstract
  const paraMatch = content.match(/<ce:para[^>]*>([\s\S]*?)<\/ce:para>/i)
                 || content.match(/<para[^>]*>([\s\S]*?)<\/para>/i);
  return xmlFragmentToHtml(paraMatch ? paraMatch[1] : content);
}

// ─── KEYWORDS HTML (rich: sup/sub preserved) ──────────────────────────────────
function extractKeywordsHtml(rawXml) {
  const groupMatch = rawXml.match(/<author-keywords[^>]*>([\s\S]*?)<\/author-keywords>/i);
  if (!groupMatch) return [];
  const kwMatches = [...groupMatch[1].matchAll(/<author-keyword[^>]*>([\s\S]*?)<\/author-keyword>/gi)];
  return kwMatches.map(m => xmlFragmentToHtml(m[1])).filter(Boolean);
}

// ─── ABSTRACT ─────────────────────────────────────────────────────────────────
function extractAbstract(json) {
  // Structure: <abstracts> → <abstract original="y"> → <ce:para>
  // findAllByKey("abstracts") avoids accidentally matching <abstract> (child)
  const abstractsNodes = findAllByKey(json, "abstracts");

  for (const node of abstractsNodes) {
    // node is the <abstracts> element; it contains an array of <abstract>
    const abstracts = toArray(node?.abstract || node);

    for (const abs of abstracts) {
      if (typeof abs !== "object") continue;

      // Prefer original="y"
      if (abs.original && abs.original !== "y") continue;

      const para = abs["ce:para"];
      if (para) return getText(para);
    }
  }

  // Fallback: search directly for ce:para inside any abstract
  const directAbstracts = findAllByKey(json, "abstract");
  for (const abs of directAbstracts) {
    if (typeof abs !== "object") continue;
    const para = abs["ce:para"];
    if (para) return getText(para);
  }

  return null;
}

// ─── KEYWORDS ─────────────────────────────────────────────────────────────────
function extractKeywords(json) {
  const keywordGroups = findAllByKey(json, "author-keywords");
  const keywords = [];

  for (const group of keywordGroups) {
    for (const kw of toArray(group?.["author-keyword"])) {
      const text = getText(kw);
      if (text) keywords.push(text);
    }
  }
  return keywords;
}

// ─── REFERENCES ───────────────────────────────────────────────────────────────
/**
 * Build a seq→rawHtml map by regex-scanning the raw XML for each <reference>.
 * This preserves <sup>/<inf> tags so they render correctly in the UI.
 */
function buildRefHtmlMap(rawXml) {
  const map = {};
  const refRe = /<reference\b[^>]*>([\s\S]*?)<\/reference>/gi;
  let rm;
  while ((rm = refRe.exec(rawXml)) !== null) {
    const body = rm[1];
    // seq attribute may sit on the <reference> tag itself
    const seqMatch = rm[0].match(/\bseq="([^"]+)"/i);
    const seq = seqMatch ? seqMatch[1] : null;
    if (!seq) continue;

    // Prefer ref-fulltext → ce:source-text → ref-text (same priority as plain text path)
    const fullTextMatch  = body.match(/<ref-fulltext[^>]*>([\s\S]*?)<\/ref-fulltext>/i);
    const sourceMatch    = body.match(/<ce:source-text[^>]*>([\s\S]*?)<\/ce:source-text>/i);
    const refTextMatch   = body.match(/<ref-text[^>]*>([\s\S]*?)<\/ref-text>/i);
    const raw = (fullTextMatch || sourceMatch || refTextMatch)?.[1] || "";
    if (raw) map[seq] = xmlFragmentToHtml(raw);
  }
  return map;
}

function extractReferences(json, rawXml) {
  const bibliographies = findAllByKey(json, "bibliography");
  const references = [];
  const refHtmlMap = rawXml ? buildRefHtmlMap(rawXml) : {};

  for (const bibList of bibliographies) {
    for (const bib of toArray(bibList)) {
      for (const ref of toArray(bib?.reference)) {
        const refInfo = ref?.["ref-info"] || {};

        // Structured reference authors
        const refAuthors = toArray(refInfo?.["ref-authors"]?.author).map(a => ({
          initials: getText(a?.["ce:initials"]),
          surname:  getText(a?.["ce:surname"]),
        }));

        // Publication year: can be an object with a "first" attribute
        const pubYearNode = refInfo?.["ref-publicationyear"];
        const publicationYear = pubYearNode
          ? (typeof pubYearNode === "object" ? pubYearNode.first || getText(pubYearNode) : getText(pubYearNode))
          : "";

        // Prefer ref-fulltext or ce:source-text for unstructured references
        const fullText   = getText(ref?.["ref-fulltext"]);
        const sourceText = getText(ref?.["ce:source-text"]);
        const seq        = ref?.seq || "";

        references.push({
          seq,
          title:           getText(refInfo?.["ref-title"]?.["ref-titletext-english"]),
          sourceTitle:     getText(refInfo?.["ref-sourcetitle"]),
          publicationYear,
          authors:         refAuthors,
          volume:          getText(refInfo?.["volisspag"]?.["volume-issue-number"]?.["vol-first"]),
          firstPage:       getText(refInfo?.["volisspag"]?.["page-information"]?.pages?.["first-page"]),
          lastPage:        getText(refInfo?.["volisspag"]?.["page-information"]?.pages?.["last-page"]),
          refText:         getText(refInfo?.["ref-text"]),
          fullText,
          sourceText,
          displayText:     fullText || sourceText || getText(refInfo?.["ref-text"]) || "",
          // Rich HTML version with <sup>/<sub> properly rendered
          displayHtml:     refHtmlMap[seq] || null,
          structured:      !!(refInfo && Object.keys(refInfo).length > 0),
        });
      }
    }
  }
  return references;
}

// ─── GRANTS ───────────────────────────────────────────────────────────────────
function extractGrants(json) {
  const grantLists = findAllByKey(json, "grantlist");
  const grants = [];

  for (const grantListArr of grantLists) {
    for (const grantList of toArray(grantListArr)) {
      // Structured grants
      for (const grant of toArray(grantList?.grant)) {
        grants.push({
          grantId:   getText(grant?.["grant-id"]),
          agency:    getText(grant?.["grant-agency"]?.organization),
          country:   getText(grant?.["grant-agency"]?.country) || getCountryCode(grant?.["grant-agency"]?.country),
          countryCode: getCountryCode(grant?.["grant-agency"]?.country),
          agencyId:  getText(grant?.["grant-agency-id"]),
        });
      }

      // Free-text grant acknowledgement (common in Oxford/AOAC articles)
      const grantText = getText(grantList?.["grant-text"]);
      if (grantText) {
        grants.push({ grantText });
      }
    }
  }
  return grants;
}

// ─── PAGES / ARTICLE NUMBER ───────────────────────────────────────────────────
function extractPages(json) {
  return {
    firstPage:     getText(findFirstValueByKey(json, "first-page")),
    lastPage:      getText(findFirstValueByKey(json, "last-page")),
    articleNumber: getText(findFirstValueByKey(json, "article-number")),
    itemId:        getText(findFirstValueByKey(json, "itemid")),
    doi:           getText(findFirstValueByKey(json, "ce:doi")),
  };
}