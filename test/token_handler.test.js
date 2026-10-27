// Route tests for the JWT token server. The SignalWire REST client is stubbed; no network access.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../app');
const { SESSION_COOKIE } = require('../public/handlers/token_handler');

const calls = [];
let nextResponse = null;

async function fakeApiClient(request) {
    calls.push(request);
    if (nextResponse instanceof Error) throw nextResponse;
    return nextResponse;
}

function upstreamFailure(status, message) {
    const error = new Error(`Request failed with status code ${status}`);
    error.response = { status, data: { message } };
    return error;
}

let server;
let base;

before(async () => {
    const app = createApp({
        page: { project: 'test-project', sdkVersion: 'stable' },
        token: { space: 'example.invalid', apiKey: 'test-key', project: 'test-project', apiClient: fakeApiClient },
    });
    await new Promise((resolve) => {
        server = app.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

function reset() {
    calls.length = 0;
    nextResponse = { data: { jwt_token: 'jwt-1', refresh_token: 'refresh-1' } };
}

test('GET / renders the page with the pinned SDK and the project prefilled', async () => {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /unpkg\.com\/@signalwire\/js@1\.5\.0\/dist\/index\.min\.js/);
    assert.match(html, /"project":"test-project"/);
    assert.doesNotMatch(html, /refresh_token/);
});

test('GET /lib/index.min.js serves the installed SDK bundle only', async () => {
    const sdk = await fetch(`${base}/lib/index.min.js`);
    assert.equal(sdk.status, 200);
    const other = await fetch(`${base}/node_modules/express/package.json`);
    assert.equal(other.status, 404);
});

test('POST /token_handler rejects a missing resource', async () => {
    reset();
    const res = await fetch(`${base}/token_handler`, { method: 'POST', body: new URLSearchParams({}) });
    assert.equal(res.status, 400);
    assert.equal(calls.length, 0);
});

test('POST /token_handler rejects a non-integer duration', async () => {
    reset();
    for (const bad of ['1e3', ' ', '-5', '0', 'abc', '1.5']) {
        const res = await fetch(`${base}/token_handler`, {
            method: 'POST',
            body: new URLSearchParams({ verto_resource_box: 'r', jwt_duration: bad }),
        });
        assert.equal(res.status, 400, `duration ${JSON.stringify(bad)} should be rejected`);
    }
    assert.equal(calls.length, 0);
});

test('POST /token_handler returns only the JWT and keeps the refresh token in a cookie session', async () => {
    reset();
    const res = await fetch(`${base}/token_handler`, {
        method: 'POST',
        body: new URLSearchParams({ verto_resource_box: 'browser-test', jwt_duration: '30' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { jwt_token: 'jwt-1', expires_in_minutes: 30 });
    const cookie = res.headers.get('set-cookie');
    assert.match(cookie, new RegExp(`^${SESSION_COOKIE}=[A-Za-z0-9_-]+; HttpOnly; SameSite=Strict; Path=/$`));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'post');
    assert.equal(calls[0].url, 'https://example.invalid/api/relay/rest/jwt');
    assert.deepEqual(calls[0].params, { resource: 'browser-test', expires_in: 30 });
    assert.deepEqual(calls[0].data, { resource: 'browser-test' });
});

test('PUT /jwt_refresh without a session is 401, with a session refreshes using the stored token', async () => {
    reset();
    const none = await fetch(`${base}/jwt_refresh`, { method: 'PUT' });
    assert.equal(none.status, 401);

    const created = await fetch(`${base}/token_handler`, {
        method: 'POST',
        body: new URLSearchParams({ verto_resource_box: 'browser-test' }),
    });
    const cookie = created.headers.get('set-cookie').split(';')[0];
    nextResponse = { data: { jwt_token: 'jwt-2', refresh_token: 'refresh-2' } };
    const refreshed = await fetch(`${base}/jwt_refresh`, {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ duration: '5' }),
    });
    assert.equal(refreshed.status, 200);
    assert.deepEqual(await refreshed.json(), { jwt_token: 'jwt-2' });
    const refreshCall = calls.at(-1);
    assert.equal(refreshCall.method, 'put');
    assert.deepEqual(refreshCall.data, { refresh_token: 'refresh-1' });
    assert.deepEqual(refreshCall.params, { expires_in: 5 });

    nextResponse = { data: { jwt_token: 'jwt-3', refresh_token: 'refresh-3' } };
    await fetch(`${base}/jwt_refresh`, { method: 'PUT', headers: { cookie } });
    assert.deepEqual(calls.at(-1).data, { refresh_token: 'refresh-2' }, 'the rotated refresh token is used next');
});

test('upstream errors pass the status and message through', async () => {
    reset();
    nextResponse = upstreamFailure(401, 'Unauthorized');
    const res = await fetch(`${base}/token_handler`, {
        method: 'POST',
        body: new URLSearchParams({ verto_resource_box: 'browser-test' }),
    });
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: 'Unauthorized', upstream_status: 401 });
});

test('cross-site requests are refused', async () => {
    reset();
    const res = await fetch(`${base}/token_handler`, {
        method: 'POST',
        headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' },
        body: new URLSearchParams({ verto_resource_box: 'browser-test' }),
    });
    assert.equal(res.status, 403);
    assert.equal(calls.length, 0);
});

test('a missing credential fails fast with a clear message', () => {
    assert.throws(
        () => createApp({ token: { space: 'x', apiKey: '', project: 'p', apiClient: fakeApiClient } }),
        /Missing required environment variable\(s\): SIGNALWIRE_API/,
    );
});
