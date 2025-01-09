**Browser SDK Example Improved**

Included is a .env that will need the credentials below.
```dotenv
SIGNALWIRE_API=SIGNALWIRE API TOKEN GOES HERE
SIGNALWIRE_PROJECT=SIGNALWIRE PROJECT ID GOES HERE
SIGNALWIRE_SPACE=your-space.signalwire.com
```
**List of Additions and Changes**
- JWT generator built within the application for ease of use.
- Automatically refreshes JWTs unless turned off.
- STUN/TURN server On/Off switch.
- Updated Bootstrap and layout slightly.
- Fixed DTMF keys being hidden. These now display properly and hide when a call is not made.
- Removed deprecated event gathering and methods.
- Ability to select codecs. (This was taken from Luca's example! Check it out: [Here](https://github.com/lpradovera/network-testing/tree/main) :)
- Customize JWT duration.

**Instructions**
1. run `npm install`
2. Enter your credentials in the example `.env`
3. run `node app.js`
4. Click/go to the URL that is generated within your terminal.
5. Once at the site, enter your project ID and a Verto resource name under the extras tab.
6. You're all set to begin placing calls!
