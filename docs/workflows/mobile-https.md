# Stable HTTPS sign-in for the physical iPhone

The ngrok account's assigned free dev domain supplies the trusted HTTPS origin. Keep the same assigned domain between runs: passkeys are scoped to its hostname. Never replace it with a random temporary tunnel URL after registering credentials.

The local starter is `infrastructure/scripts/mobile-https.mjs`. It deliberately runs a separate HTTPS-origin API and web frontend so the existing localhost relying party and existing localhost credentials remain usable.

- Existing API/web: unchanged on ports 3001 and 3200.
- Phone API: Mac's LAN IP, port 3002, same isolated Circle.social PostgreSQL/Redis services.
- Tunnel frontend: loopback port 3203, exposed through the assigned HTTPS ngrok domain.
- Physical development bundle: Metro port 8084.
- Agent management: loopback port 4041; request inspection disabled.

The stable domain is used for `WEB_ORIGIN`, `WEBAUTHN_RP_ID`, the frontend's `CIRCLE_WEB_ORIGIN` and the native app's `EXPO_PUBLIC_WEB_URL`. The phone's API URL uses port 3002 on the Mac. Native still uses the existing one-time PKCE handoff; no native release authentication bypass is enabled. HTTPS development authentication cookies are Secure, HttpOnly and SameSite Strict. Local HTTP cookies retain their existing behavior.

## Connect the account once

Use the ngrok dashboard's **Your Authtoken** page. Copy the existing token; do not rotate it and do not paste it in chat, a tracked source file or a shell command.

For a private browser setup form, run:

```sh
node infrastructure/scripts/mobile-https-setup.mjs
```

Open `http://127.0.0.1:3215/`, paste into its password field and click Connect ngrok. The form binds only to loopback, checks Host, exact Origin, a same-site cookie and a random CSRF nonce, has no third-party assets/scripts, and does not log or echo the credential. It writes only `infrastructure/.env.ngrok.yml`, verified ignored by Git, with file permissions 600. Stop the form after connecting.

Alternatively, `mobile-https.mjs --origin <assigned-https-origin> --setup-only` uses a hidden local Terminal prompt. Both methods keep the credential out of shell history and command-line arguments. The official signed ngrok agent is installed at `~/.local/bin/ngrok`.

## Run

```sh
pnpm mobile:https --origin https://YOUR-ASSIGNED-DOMAIN.ngrok-free.dev --device YOUR-IPHONE-UDID
```

The starter builds the workspace, verifies its own ports are free without stopping existing services, starts the additional API/frontend, verifies the generated passkey RP and secure cookie, and opens the tunnel with HTTP request inspection disabled. Only after HTTPS responds does it update the two public URLs in ignored `apps/mobile/.env.local`; its original contents are backed up once to ignored `apps/mobile/.env.before-https`. Other environment settings are preserved. It rebuilds/opens the existing signed debug app on the specified iPhone. Keep it running while testing; Control+C stops only its own child process groups. Logs are private files under the system temporary directory's `circle-mobile-https` folder.

Use `--check` to review the addresses without changing configuration or opening a tunnel. `--no-build` is available only when the current workspace build has already passed. If the Mac IP changes, restart the starter; its HTTPS relying party remains stable, while the LAN API address is refreshed.

The six original communities and all existing accounts remain in the same Circle.social database. Existing localhost passkeys continue to work at localhost. They are not automatically valid on the HTTPS dev domain: new credentials must be registered for it, or an existing account must use its verified recovery flow to add a passkey for the new relying party. Do not delete users, passkeys or recovery data to switch domains.

## Verification

The helper tests reject non-HTTPS origins, lookalike domains, URL credentials, ports, query strings and paths, and verify updates preserve unrelated mobile environment values. The HTTPS integration test uses the isolated `circle_social_test` database and Redis database 1 to check exact domain binding, registration verification, secure cookies, rejection of the old/wrong Origin, PKCE mismatch, successful native exchange and grant replay prevention. Real-device Face ID/passkey prompts require the phone owner to complete them.
