/* ./routes/verto_call.js */
const express = require('express');
require('dotenv').config();
const router = express.Router();

router.get("/", function (req, res) {
    res.render("verto_call.ejs", {
        sdkVersion: process.env.SDK_VERSION || 'stable'
    });
});
module.exports = router;
