# SignalWire Browser SDK v2 example

A small Express app and a single page that exercise the [Browser SDK v2 `Relay` client](https://signalwire.com/docs/browser-sdk/v2/js)
against your own SignalWire space. It is built as a test harness: generate a JWT, connect, place and
receive calls, switch devices, try ICE and codec settings.

> **Not for production.** This is an example app for trying out the Browser SDK v2 and its features
> on your own machine. It is not designed, tested or hardened for production use. Use it to learn
> the SDK and to test calls against your space, not as the basis of a deployed application. See
> [Before building on this](#before-building-on-this) for what a production app needs instead.

> The v2 SDK is deprecated. SignalWire's docs state it "will be end of life and unsupported starting
> June 2027". This example tracks v2 only; it is the SDK that dials PSTN numbers and SIP endpoints
> from the browser.

## Setup

1. `npm install`
2. Copy `example.env` to `.env` and fill in the API token, Project ID and space hostname.
3. `npm start`, then open the URL printed in the terminal (default `http://127.0.0.1:8080`).
4. The Project ID is prefilled from `.env`. Enter a resource name and click **Generate JWT and connect**.
5. Enter a destination (a resource name, a SIP address or a phone number) and click **Start call**.

### Environment variables

| Variable                                                   | Purpose                                                                                                                                                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SIGNALWIRE_API`, `SIGNALWIRE_PROJECT`, `SIGNALWIRE_SPACE` | Credentials for the JWT REST endpoint. They never leave the server.                                                                                                                                    |
| `SDK_VERSION`                                              | `stable` loads the pinned CDN build; `local` serves `node_modules/@signalwire/js/dist/index.min.js`. Install another 1.x build with `npm install @signalwire/js@<version>` to test it in `local` mode. |
| `HOST`, `PORT`                                             | Bind address and port. Default `127.0.0.1:8080`. The devcontainer sets `HOST=0.0.0.0` so port forwarding works.                                                                                        |

The CDN version is pinned in `public/routes/verto_call.js`. Bump it on purpose;
`npm view @signalwire/js dist-tags` shows what exists (`legacy` is the 1.x line).

## What the page does

Everything the page calls is in the v2 reference: [Relay client](https://signalwire.com/docs/browser-sdk/v2/js/reference/relay-client),
[Call](https://signalwire.com/docs/browser-sdk/v2/js/reference/call),
[notifications](https://signalwire.com/docs/browser-sdk/v2/js/reference/notification).

- **JWT generation and refresh.** The server creates the JWT and keeps the refresh token in memory,
  keyed by an HttpOnly cookie; the browser only sees `jwt_token`. On the SDK's `refreshToken`
  notification the page refreshes automatically unless the switch is off. The JWT field shows a
  countdown to expiry.
- **Connection state** from `signalwire.ready`, `signalwire.error` and the `signalwire.socket.*`
  events, including a "Reconnecting…" state while the SDK retries a dropped socket.
- **Outbound calls** through `newCall` with audio/video switches, an optional caller number, the
  selected devices (`micId`, `camId`, `speakerId`) and the chosen ICE servers.
- **Inbound calls** shown with the caller's name and number from `participantData`, with Answer and
  Decline buttons. Call recovery after a page reload uses the same panel.
- **In-call controls:** mute, deaf, hold/unhold, camera off, and a DTMF keypad. Button state is
  derived from the call's tracks and state, not from the last click.
- **Devices:** microphone, camera and speaker pickers from `getAudioInDevices`, `getVideoDevices`
  and `getAudioOutDevices`, refreshed on `devicechange`, remembered across reloads, applied to the
  next call and switchable on a live call (`setAudioInDevice`, `setVideoDevice`, `setAudioOutDevice`).
  `checkPermissions` reports whether the browser has granted media access.
- **ICE servers** per call: platform default, none, or a custom STUN/TURN list.
- **Codec preferences** (audio and video) through a page-level `setCodecPreferences` patch in
  `public/js/codecs.js`. This is not an SDK feature; with everything selected the browser negotiates
  normally.
- **Event log** with timestamps, an optional dump of raw socket messages, and **Copy call summary**
  (call ID, direction, states, cause code, settings and recent events) for pasting into a support ticket.

## Security notes for a local tool

- Credentials stay in `.env` on the server. The page receives the JWT only.
- `/token_handler` and `/jwt_refresh` refuse cross-site requests and are rate limited per IP. Anyone
  who can reach the port can still mint JWTs for the project, so keep `HOST=127.0.0.1` unless you
  need LAN access.
- Only the SDK's `dist` folder is served, at `/lib`.

## Before building on this

The example takes shortcuts that are fine on your own machine and wrong for a deployed app:

- **Anyone who can reach the server can get a JWT.** There are no user accounts. A production token
  endpoint should issue JWTs only to signed-in users, and only for the resources they are allowed to use.
- **Sessions live in memory.** Refresh tokens are held in the Node process, so they are lost on restart
  and don't work across several servers. Use a real session store.
- **No HTTPS.** The server speaks plain HTTP for local use. Browsers only allow camera and microphone
  access on HTTPS or `localhost`, and tokens should never travel over plain HTTP.
- **The page is a test console.** It exposes raw settings (ICE servers, codecs, socket logging) and
  writes call details to an on-page log. A customer-facing app should hide these.
- **Codec selection patches the browser.** The codec picker wraps `RTCPeerConnection` methods for the
  whole page. It is not an SDK feature and is there only for experiments.
- **Minimal tests and no monitoring.** The tests cover the token routes only.

## Development

- `npm test` runs the route tests (`node --test`, SignalWire REST stubbed).
- `npm run lint` runs ESLint; `npm run format` runs Prettier.
- Layout: `app.js` (server), `public/handlers/token_handler.js` (JWT routes),
  `public/routes/verto_call.js` (page), `views/verto_call.ejs` (markup),
  `public/css/app.css` (theme tokens and components), `public/js/app.js` (page logic),
  `public/js/codecs.js` (codec patch).
- The look follows signalwire.com/docs. Change `:root` in `public/css/app.css` to restyle the page.
  The header's System / Light / Dark toggle is remembered per browser; System follows the OS setting.

## Troubleshooting

- **"Permission missing"** in Devices: allow the microphone and camera for the site, then click
  **Check permissions**. Device labels appear once permission is granted.
- **Token request fails with a SignalWire status:** the API token, Project ID or space in `.env` is
  wrong, or the space cannot be reached.
- **Status shows "Reconnecting…":** the socket dropped and the SDK is retrying. A JWT expiry ends the
  session instead and needs a new token.
- **Codec or ICE changes have no effect on a live call:** they apply when the next offer is created.
  Change them before starting the call.
