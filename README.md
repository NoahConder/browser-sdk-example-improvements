# Browser SDK Example - Improved

This project aims to add additional functionality to the vanilla SignalWire Browser SDK example, featuring several enhancements for ease of use and control.

## Setup
### Environment Variables
You'll need to create a `.env` file from `example.env` with the following credentials:
```dotenv
SIGNALWIRE_API=SIGNALWIRE-API-TOKEN-GOES-HERE
SIGNALWIRE_PROJECT=SIGNALWIRE-PROJECT-ID-GOES-HERE
SIGNALWIRE_SPACE=your-space.signalwire.com
SDK_VERSION=stable
```

**SDK_VERSION Options:**
- `stable` - Uses the latest stable SDK from CDN (default)
- `local` - Uses the webpack-bundled SDK from `/public/lib/signalwire-bundle.js`

### List of Additions and Changes
- **Built-in JWT Generator** – Generates JWTs within the app for easy authentication.
- **Auto JWT Refresh** – Automatically refreshes JWTs unless disabled.
- **STUN/TURN Toggle** – Easily enable or disable STUN/TURN servers.
- **UI Enhancements** – Updated Bootstrap and improved layout.
- **DTMF Key Fix** – DTMF keys now display correctly and hide when no call is active.
- **Deprecated Methods Removed** – Cleaned up outdated event gathering and methods.
- **Codec Selection** – Choose preferred codecs (This was taken from Luca's example! Check it out: [Here](https://github.com/lpradovera/network-testing/tree/main) :)
- **JWT Customization** – Set the duration of JWTs as needed.
- **Device Selection** – Choose input devices.
- **Mute Controls** – Mute/unmute video and audio during a call.
- **SDK Version Selection** – Switch between the latest stable CDN release and local SDK versions for testing and development
- **Webpack Support** – Bundle the @signalwire/js package from npm for local development
### Instructions
1. run `npm install`
2. Change `example.env` to `.env` and enter your credentials.
3. (Optional) If using `SDK_VERSION=local`, run `npm run build` to bundle the SDK
4. run `node app.js`
5. Open the generated URL from the terminal in your browser.
6. Once at the site, enter your Project ID and a Verto resource name.
7. You're all set! Press connect and start making calls!
