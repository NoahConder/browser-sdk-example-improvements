// JWT routes for the SignalWire Browser SDK v2 example.
//
// POST /token_handler  -> creates a Relay JWT for a resource. The browser gets only `jwt_token`;
//                         the refresh token stays here, keyed by an HttpOnly session cookie.
// PUT  /jwt_refresh    -> refreshes the JWT for the caller's session. No body needed.
//
// Docs: https://signalwire.com/docs/browser-sdk/v2/js ("Generating a JWT"): `expires_in` is in
// minutes (default 15); "The JWT is safe to expose to the client, but the refresh_token should be
// kept secret."
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const SESSION_COOKIE = 'sw_example_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 1000;
const DURATION_RE = /^[1-9]\d{0,4}$/; // whole minutes, 1..99999

function parseCookies(header = '') {
    const out = {};
    for (const part of header.split(';')) {
        const idx = part.indexOf('=');
        if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
    return out;
}

// Refuses requests whose browser says they came from another site. Browsers send
// Sec-Fetch-Site on every request; curl and scripts don't, and those are not the concern here.
function sameOrigin(req, res, next) {
    const site = req.get('sec-fetch-site');
    if (site && site !== 'same-origin' && site !== 'none') {
        return res.status(403).json({ error: 'Cross-site requests are not allowed' });
    }
    const origin = req.get('origin');
    if (origin) {
        let host;
        try {
            host = new URL(origin).host;
        } catch {
            return res.status(403).json({ error: 'Invalid Origin header' });
        }
        if (host !== req.get('host')) {
            return res.status(403).json({ error: 'Cross-origin requests are not allowed' });
        }
    }
    next();
}

function rateLimit({ limit = 30, windowMs = 60 * 1000 } = {}) {
    const hits = new Map();
    return (req, res, next) => {
        const now = Date.now();
        const key = req.ip || 'unknown';
        let entry = hits.get(key);
        if (!entry || now - entry.start > windowMs) {
            entry = { start: now, count: 0 };
            hits.set(key, entry);
        }
        entry.count += 1;
        if (hits.size > 10000) hits.clear();
        if (entry.count > limit) {
            return res.status(429).json({ error: 'Too many token requests; wait a minute and retry' });
        }
        next();
    };
}

function upstreamError(res, error, fallback) {
    const status = error.response?.status;
    const message = error.response?.data?.message || error.response?.data?.error || error.message || fallback;
    console.error(`${fallback}:`, status || '', message);
    res.status(status || 502).json({ error: message, upstream_status: status || null });
}

function createTokenRouter(options = {}) {
    const space = options.space ?? process.env.SIGNALWIRE_SPACE;
    const apiKey = options.apiKey ?? process.env.SIGNALWIRE_API;
    const project = options.project ?? process.env.SIGNALWIRE_PROJECT;
    const missing = [
        ['SIGNALWIRE_SPACE', space],
        ['SIGNALWIRE_API', apiKey],
        ['SIGNALWIRE_PROJECT', project],
    ]
        .filter(([, v]) => !v)
        .map(([k]) => k);
    if (missing.length) {
        throw new Error(
            `Missing required environment variable(s): ${missing.join(', ')}. Copy example.env to .env and fill it in.`,
        );
    }

    const apiClient =
        options.apiClient ||
        axios.create({
            timeout: 5000,
            headers: { Authorization: `Basic ${Buffer.from(`${project}:${apiKey}`).toString('base64')}` },
        });
    const jwtUrl = `https://${space}/api/relay/rest/jwt`;

    // session id -> { refreshToken, createdAt }
    const sessions = new Map();
    function pruneSessions() {
        const now = Date.now();
        for (const [id, s] of sessions) {
            if (now - s.createdAt > SESSION_TTL_MS) sessions.delete(id);
        }
        while (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
    }

    const router = express.Router();
    const guards = [sameOrigin, rateLimit(options.rateLimit)];

    function validateDuration(raw) {
        if (raw === undefined || raw === null || raw === '') return { ok: true, value: null };
        const str = String(raw).trim();
        if (!DURATION_RE.test(str)) return { ok: false };
        return { ok: true, value: Number(str) };
    }

    router.post('/token_handler', ...guards, async (req, res) => {
        const resource = typeof req.body.verto_resource_box === 'string' ? req.body.verto_resource_box.trim() : '';
        if (!resource || resource.length > 255) {
            return res.status(400).json({ error: 'A resource name (1-255 characters) is required' });
        }
        const duration = validateDuration(req.body.jwt_duration);
        if (!duration.ok) {
            return res.status(400).json({ error: 'Duration must be a whole number of minutes' });
        }

        try {
            const params = { resource };
            if (duration.value) params.expires_in = duration.value;
            const response = await apiClient({ method: 'post', url: jwtUrl, params, data: { resource } });
            const { jwt_token, refresh_token } = response.data || {};
            if (!jwt_token) {
                return res.status(502).json({ error: 'Unexpected response from SignalWire (no jwt_token)' });
            }

            const sessionId = crypto.randomBytes(24).toString('base64url');
            pruneSessions();
            sessions.set(sessionId, { refreshToken: refresh_token, createdAt: Date.now() });
            res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${sessionId}; HttpOnly; SameSite=Strict; Path=/`);
            console.log('Token successfully generated.');
            res.json({ jwt_token, expires_in_minutes: duration.value || 15 });
        } catch (error) {
            upstreamError(res, error, 'Failed to generate token');
        }
    });

    router.put('/jwt_refresh', ...guards, async (req, res) => {
        const sessionId = parseCookies(req.get('cookie'))[SESSION_COOKIE];
        const session = sessionId && sessions.get(sessionId);
        if (!session || !session.refreshToken) {
            return res.status(401).json({ error: 'No refresh token for this session; generate a new JWT' });
        }
        const duration = validateDuration(req.body?.duration);
        if (!duration.ok) {
            return res.status(400).json({ error: 'Duration must be a whole number of minutes' });
        }

        try {
            const params = duration.value ? { expires_in: duration.value } : undefined;
            const response = await apiClient({
                method: 'put',
                url: jwtUrl,
                params,
                data: { refresh_token: session.refreshToken },
            });
            const { jwt_token, refresh_token } = response.data || {};
            if (!jwt_token) {
                return res.status(502).json({ error: 'Unexpected response from SignalWire (no jwt_token)' });
            }
            session.refreshToken = refresh_token || session.refreshToken;
            console.log('Token successfully refreshed.');
            res.json({ jwt_token });
        } catch (error) {
            upstreamError(res, error, 'Failed to refresh token');
        }
    });

    return router;
}

module.exports = createTokenRouter;
module.exports.createTokenRouter = createTokenRouter;
module.exports.SESSION_COOKIE = SESSION_COOKIE;
