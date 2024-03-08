/* ./handlers/phone_handler.js */
const express = require('express');
require('dotenv').config()
const router = express.Router();
const axios = require('axios');
const space = process.env.SIGNALWIRE_SPACE
const api_key = process.env.SIGNALWIRE_API
const project = process.env.SIGNALWIRE_PROJECT

const combined = `${project}:${api_key}`;
const base64Result = Buffer.from(combined).toString('base64');
router.post("/phone_handler", function (req, res) {

    const resource = req.body.verto_resource_box; // Get the user's resource name for their verto endpoint.


    axios({
        method: 'post',
        url: `https://${space}/api/relay/rest/jwt?resource=${resource}`,
        headers: {
            'resource': `${resource}`,
            'Authorization': `Basic ${base64Result}`
        },
        data: {
            resource: `${resource}`
        }
    })
        .then(response => {
            console.log("Token successfully generated.");
            const data = response.data;
            res.json({jwt_token: data.jwt_token, refresh_token: data.refresh_token}); // Send the token and refresh token to the client.


        })
        .catch(error => {
            console.error(error);
        });
});

router.post("/jwt_refresh", function (req, res) {

    const jwt_refresh = req.body.jwt_refresh; // Refresh token that we pull from the client. This is put into the client once they request a JWT.

    axios({
        method: 'post',
        url: `https://${space}/api/relay/rest/jwt`,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${base64Result}`
        },
        data: {
            refresh_token: `${jwt_refresh}`
        }
    })
        .then(response => {
            console.log("Refresh successfully generated.");
            const data = response.data;
            res.json({jwt_token: data.jwt_token, refresh_token: data.refresh_token}); // Send the tokens to the client.


        })
        .catch(error => {
            console.error(error);
        });
});

module.exports = router;
