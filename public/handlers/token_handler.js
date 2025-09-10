const express = require('express');
require('dotenv').config();
const router = express.Router();
const axios = require('axios');

// Environment variables validation
const requiredEnvVars = ['SIGNALWIRE_SPACE', 'SIGNALWIRE_API', 'SIGNALWIRE_PROJECT'];
requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
        throw new Error(`Missing required environment variable: ${varName}`);
    }
});

const space = process.env.SIGNALWIRE_SPACE;
const api_key = process.env.SIGNALWIRE_API;
const project = process.env.SIGNALWIRE_PROJECT;
const base64Result = Buffer.from(`${project}:${api_key}`).toString('base64');

// Input validation middleware
const validateTokenRequest = (req, res, next) => {
    const { verto_resource_box, jwt_duration } = req.body;
    
    if (!verto_resource_box || typeof verto_resource_box !== 'string') {
        return res.status(400).json({ error: 'Invalid resource parameter' });
    }
    
    if (jwt_duration && (!Number.isInteger(Number(jwt_duration)) || jwt_duration < 0)) {
        return res.status(400).json({ error: 'Invalid duration parameter' });
    }
    
    next();
};

// Axios instance with defaults
const apiClient = axios.create({
    timeout: 5000, // 5 second timeout
    headers: {
        'Authorization': `Basic ${base64Result}`
    }
});

router.post("/token_handler", validateTokenRequest, async (req, res) => {
    try {
        const resource = encodeURIComponent(req.body.verto_resource_box);
        const duration = Number(req.body.jwt_duration);

        if (duration && isNaN(duration)) {
            return res.status(400).json({error: 'Duration must be a number'});
        }

        let apiUrl = `https://${space}/api/relay/rest/jwt?resource=${resource}`;
        if (duration) {
            apiUrl += `&expires_in=${duration}`;
        }

        const response = await apiClient({
            method: 'post',
            url: apiUrl,
            data: {resource}
        });

        console.log("Token successfully generated.");
        res.json({
            jwt_token: response.data.jwt_token,
            refresh_token: response.data.refresh_token
        });
    } catch (error) {
        console.error("Error generating token:", error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.message || 'Failed to generate token'
        });
    }
});

router.put("/jwt_refresh", async (req, res) => {
    try {
        const {refresh_token} = req.body;
        const duration = Number(req.body.duration);

        if (!refresh_token) {
            return res.status(400).json({error: 'Refresh token is required'});
        }

        if (duration && isNaN(duration)) {
            return res.status(400).json({error: 'Duration must be a number'});
        }

        let apiUrl = `https://${space}/api/relay/rest/jwt`;
        if (duration) {
            apiUrl += `?expires_in=${encodeURIComponent(duration)}`;
        }

        const response = await apiClient({
            method: 'put',
            url: apiUrl,
            headers: {
                'Content-Type': 'application/json'
            },
            data: {refresh_token}
        });

        console.log("Refresh successfully generated.");
        res.json({
            jwt_token: response.data.jwt_token,
            refresh_token: response.data.refresh_token
        });
    } catch (error) {
        console.error("Error refreshing token:", error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.message || 'Failed to refresh token'
        });
    }
});

module.exports = router;