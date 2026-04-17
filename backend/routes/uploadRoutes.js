const express = require("express");
const router = express.Router();
const multer = require("multer");

const parseXML = require("../engines/xmlParserEngine");
const parsePDF = require("../engines/pdfParserEngine");
const compareXMLPDF = require("../engines/comparisonEngine");

// 📁 STORAGE CONFIG
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (
      file.mimetype === "application/xml" ||
      file.originalname.endsWith(".xml")
    ) {
      cb(null, "uploads/xml");
    } else {
      cb(null, "uploads/pdf");
    }
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage: storage });

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
      xmlPath: xmlPath.replace(/\\/g, "/"),
      pdfPath: pdfPath.replace(/\\/g, "/")
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

module.exports = router;