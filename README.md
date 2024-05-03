Browser SDK Example Improved
---------
Included is a .ENV that will need the credentials below.
```dotenv
SIGNALWIRE_API=SIGNALWIRE API TOKEN GOES HERE
SIGNALWIRE_PROJECT=SIGNALWIRE PROJECT ID GOES HERE
SIGNALWIRE_SPACE=your-space.signalwire.com
```
List of additions:

-----------

- JWT generator built within the application for ease of access.
- Refresh JWT button.
- STUN server On/Off switch.
- Updated Bootstrap and layout slightly.
- Fixed DTMF keys being broken. These now display properly and hide when a call is not made.
- Removed deprecated event gathering and methods.
