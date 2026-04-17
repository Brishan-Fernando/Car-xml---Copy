const express = require("express");
const router = express.Router();

const parsePDF = require("../engines/pdfParserEngine");

router.get("/parse", async (req, res) => {

  const filePath = "uploads/pdf/sample.pdf";

  const parsedPDF = await parsePDF(filePath);

  res.json(parsedPDF);

});

module.exports = router;