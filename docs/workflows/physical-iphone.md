# Local iPhone development over USB

The physical device build uses the existing Apple development team `7889MB544R`. Connect the iPhone by USB, trust the Mac and enable Developer Mode. The app installs through the cable; Metro and the backend use the local network. The phone and Mac must share the same LAN, and iOS Local Network access must be allowed for Circle.social.

Local configuration lives in ignored `apps/mobile/.env.local`. The current development API address is `http://192.168.31.33:3001`. If the Mac's Wi-Fi IP changes, update this file and restart Metro. Never point a physical phone at `127.0.0.1` for the Mac's API.

Start the backend, retaining the existing WebAuthn origin:

```sh
HOST=0.0.0.0 WEB_ORIGIN=http://localhost:3200 pnpm --filter api dev
```

Run the existing web authentication frontend on the Mac:

```sh
CIRCLE_API_URL=http://127.0.0.1:3001 CIRCLE_WEB_ORIGIN=http://localhost:3200 pnpm --filter web exec next start --hostname localhost --port 3200
```

Build and install a debug app on the connected phone (the device ID can be obtained with `xcrun devicectl list devices`):

```sh
pnpm --filter mobile exec expo run:ios --device <device-UDID> --port 8083
```

The repository's Ruby/CocoaPods toolchain can be selected using `~/.local/bin/mise exec ruby@3.4.12 --` before the command above. Alternatively, open `apps/mobile/ios/Circlesocial.xcworkspace`, choose the physical iPhone destination and run the Circlesocial scheme. Keep Metro running on port 8083 for the Debug build.

## Authentication boundary

API connectivity over a LAN IP does not change the existing `localhost` passkey relying party. The current browser authentication URL remains `http://localhost:3200`, intended for browser authentication on the Mac/simulator. On a physical iPhone, localhost means the phone itself. Consequently, installation and IP backend connectivity are ready, but the existing browser sign-in flow cannot complete directly on that physical phone until a trusted HTTPS authentication domain and matching WebAuthn origin/RP are configured. Existing localhost passkeys are scoped to localhost and cannot simply be moved to an IP address or new domain.

No authentication bypass, disabled certificate verification or new account credentials are introduced by this local build setup. The existing local-network ATS allowance is retained; global arbitrary network loads remain disabled. Database and Redis continue to bind only to the Mac's loopback interface.
