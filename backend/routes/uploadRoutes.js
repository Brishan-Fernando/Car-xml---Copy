const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const parseXML = require("../engines/xmlParserEngine");
const parsePDF = require("../engines/pdfParserEngine");
const compareXMLPDF = require("../engines/comparisonEngine");

const uploadsRoot = path.join(__dirname, "..", "uploads");
const xmlUploadDir = path.join(uploadsRoot, "xml");
const pdfUploadDir = path.join(uploadsRoot, "pdf");

[uploadsRoot, xmlUploadDir, pdfUploadDir].forEach((dir) => {
  fs.mkdirSync(dir, { recursive: true });
});

// 📁 STORAGE CONFIG
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (
      file.mimetype === "application/xml" ||
      file.originalname.endsWith(".xml")
    ) {
      cb(null, xmlUploadDir);
    } else {
      cb(null, pdfUploadDir);
    }
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage: storage });

router.get("/file/:type/:filename", (req, res) => {
  const { type, filename } = req.params;
  const baseDir = type === "xml" ? xmlUploadDir : type === "pdf" ? pdfUploadDir : null;

  if (!baseDir) {
    return res.status(400).json({ error: "Invalid file type" });
  }

  const filePath = path.join(baseDir, path.basename(filename));

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  return res.sendFile(filePath);
});

// 🚀 MAIN ROUTE
router.post(
  "/files",
  upload.fields([
    { name: "xml", maxCount: 1 },
    { name: "pdf", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      // ✅ SAFETY CHECK (VERY IMPORTANT)
      if (!req.files || !req.files.xml || !req.files.pdf) {
        return res.status(400).json({
          error: "Both XML and PDF files are required",
        });
      }

      const xmlPath = req.files.xml[0].path;
      const pdfPath = req.files.pdf[0].path;
      const xmlPublicPath = `/api/upload/file/xml/${path.basename(xmlPath)}`;
      const pdfPublicPath = `/api/upload/file/pdf/${path.basename(pdfPath)}`;

      console.log("XML uploaded:", xmlPath);
      console.log("PDF uploaded:", pdfPath);

      // 🧠 PARSE
      const xmlData = await parseXML(xmlPath);
      const pdfData = await parsePDF(pdfPath);

      // ⚖️ COMPARE
      const comparison = compareXMLPDF(xmlData, pdfData);

      // ✅ CLEAN RESPONSE (FRONTEND FRIENDLY)
    res.json({
  success: true,
  message: "Files processed successfully",
  data: {
    xml: xmlData,
    pdf: pdfData,
    comparison: comparison,
    files: {
      xmlPath: xmlPublicPath,
      pdfPath: pdfPublicPath
    }
  }
});

    } catch (error) {
      console.error("Processing error:", error);

      res.status(500).json({
        success: false,
        message: "Upload succeeded but parsing failed",
        error: error.message,
      });
    }
  }
);

router.get("/test", (req, res) => {
  res.json({ message: "Upload API working" });
});

module.exports = router;
