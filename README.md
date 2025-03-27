# Browser SDK Example Improved

Included is a .env that will need the credentials below.

```dotenv
SIGNALWIRE_API=SIGNALWIRE API TOKEN GOES HERE
SIGNALWIRE_PROJECT=SIGNALWIRE PROJECT ID GOES HERE
SIGNALWIRE_SPACE=your-space.signalwire.com
```

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

### Instructions
1. run `npm install`
2. Change `example.env` to `.env` and enter your credentials.
3. run `node app.js`
4. Open the generated URL from the terminal in your browser.
5. Once at the site, enter your Project ID and a Verto resource name.
6. You're all set! Press connect and start making calls!
