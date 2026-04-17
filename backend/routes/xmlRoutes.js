const express = require("express");
const router = express.Router();

const parseXML = require("../engines/xmlParserEngine");

router.get("/parse", (req, res) => {

  const filePath = "uploads/xml/sample.xml";

  const parsedData = parseXML(filePath);

  res.json(parsedData);

});

module.exports = router;