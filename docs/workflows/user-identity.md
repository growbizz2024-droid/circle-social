# User identity — Milestone 1.1

Circle.social retains its passkey authentication and existing User UUIDs, handles, passkeys, sessions, audit events and community memberships. New registrations without a requested legacy handle receive a generated `adjective_animal_0000` pseudonym. PostgreSQL uniqueness remains authoritative; generated collisions retry with a new candidate. Handles are stable and cannot be edited through the profile API.

## Profile contract

`GET /v1/users/me` returns only the authenticated user's profile. `PATCH /v1/users/me` accepts `profileVersion` and at least one of `displayName`, `bio`, `avatarId`, `profileTheme`, or `profileAccent`. Unknown fields are rejected. Display names are optional, trimmed and limited to 50 characters; bios to 280. Empty text becomes null. Avatars come from the shared preset catalog; arbitrary image URLs are not accepted. Themes are SYSTEM/LIGHT/DARK and accents INDIGO/TEAL/ROSE/AMBER.

Every update increments `profileVersion`. A stale version returns 409, so clients must reload before saving again. A profile update never changes the account UUID, handle, status, passkeys or memberships. The additive migration gives existing users default appearance values; it does not delete or recreate tables.

`POST /v1/users/me/deactivate` requires the exact handle as `confirmation` and authentication within five minutes. It atomically marks the account DEACTIVATED, revokes all its sessions and writes an audit event. Passkeys, profile data and memberships are retained. There is no self-service reactivation or data-erasure flow in this milestone. Session creation locks the active account row so a concurrent login cannot leave an active session after deactivation.

The UI also exposes the existing passkey and session endpoints, including identification of the current session. Removing the last passkey remains forbidden. Cookies and session tokens are never part of profile DTOs.

## Web development

Start the API on port 3001 and web on `http://localhost:3000`. The web server proxies an explicit allowlist of API paths through `/api/v1`. Optional server variables are `CIRCLE_API_URL` (default `http://127.0.0.1:3001`) and `CIRCLE_WEB_ORIGIN` (default `http://localhost:3000`). Keep the API's `WEB_ORIGIN` and passkey relying-party settings aligned with that origin. Existing HttpOnly cookies pass through the proxy; browser JavaScript does not store bearer tokens. Mutations require the configured Origin on both layers.

## Mobile local browser authentication

Mobile uses Expo Router and a native development build with the `circlesocial` scheme. Expo Go does not register this application's callback scheme. Use the SDK-compatible packages from the lockfile. With Xcode/CocoaPods or Android tooling installed, create a local development build using `pnpm --filter mobile exec expo run:ios` or `expo run:android`. These commands generate local native projects; generated projects are not required for the shared source checkpoint.

Copy `apps/mobile/.env.example` to its ignored `.env.local` and configure public API/web URLs. The iOS simulator can use the localhost defaults. Android's emulator typically reaches the host at `10.0.2.2`; the browser web origin must still be a trustworthy HTTPS origin for WebAuthn (localhost is the development exception). A physical device needs reachable HTTPS development services and matching RP/origin configuration; host loopback addresses refer to the device itself. These variables contain no credentials.

The app creates a random verifier and state, stores them in SecureStore, and opens `/mobile-connect` in the system browser. After a fresh passkey session and explicit consent, the browser receives a 30-second, single-use code bound to the SHA-256 verifier challenge. Only the fixed `circlesocial://auth/callback` is used. The app validates callback state and exchanges the code without ambient cookies. The API rechecks the original browser session and active user inside the session transaction. Tokens are stored in SecureStore with device-only keychain accessibility. Wrong verifiers, expiry, replay and a revoked source session cannot create a session.

This handoff is deliberately disabled by the API in production and by the mobile client in release builds. Native release authentication requires agreed HTTPS domains, platform identifiers and associated-domain/app-link configuration. Do not publish the local handoff as release authentication. The browser test verifies consent and exchange; it does not constitute native device validation.

## Verification

Run the normal build, typecheck, lint and unit tests, then `pnpm test:integration`. Integration tests use the isolated `_test` database and Redis DB 1. Install Chromium with `pnpm exec playwright install chromium`, then run `pnpm test:e2e`. Playwright starts separate API/web servers on 3201/3200, uses a real virtual WebAuthn authenticator, exercises profile persistence/conflicts, browser consent, PKCE exchange, login and deactivation, and cleans up only its generated identity. Do not run tests that mutate shared test rate keys concurrently. Traces are disabled to avoid recording authentication payloads; screenshots are ignored artifacts.

## Complete onboarding — Milestone 1.2

The fourteen-stage sequence, recovery security contract, atomic completion and personalized feed are documented in [onboarding.md](onboarding.md). Passkeys precede recovery, interests, communities and final review. Web and the local mobile browser flow use the same completion backend; completed users return directly to home. The profile PUT endpoint edits completed users’ preferences; POST `/v1/users/me/complete` validates new registrations and joins selected communities transactionally. Full privacy settings, publishing and ranked feeds remain later milestones.

### Local iOS toolchain

The development machine uses a user-local mise Ruby 3.4.12 and CocoaPods 1.17.0; the macOS system Ruby is unchanged. No global Ruby activation is needed. In a terminal with Node/pnpm loaded, run:

```sh
~/.local/bin/mise exec ruby@3.4.12 -- pnpm --filter mobile ios
```

Expo generates the ignored `apps/mobile/ios` project and installs its pods. The generated local bundle identifier is `com.anonymous.circle-social`; it is not a registered release identity. The dedicated simulator is named `Circle.social iPhone` (iPhone 17 Pro, iOS 26.5). Xcode is 26.6. The app uses the `circlesocial` callback scheme.

For isolated manual validation, use the same test API/web configuration as Playwright on ports 3201/3200 and launch Metro with `EXPO_PUBLIC_API_URL=http://127.0.0.1:3201 EXPO_PUBLIC_WEB_URL=http://localhost:3200`. Keep those servers separate from the ads application using port 3000. Public URLs are build-time configuration; restart Metro after changing them. Do not switch the normal development API to the test database.

### iOS simulator validation — 4 November 2026

The native Debug build was installed and launched on the dedicated iPhone simulator. Xcode reported zero errors and two dependency warnings (Expo's internal `CoreModule` provider warning and a duplicate `-lc++` linker entry). No dependency files were patched to suppress them.

Verified interactively in the native app:

- System authentication-browser launch and rendering of the local web sign-in page.
- PKCE callback completion using a disposable, signed WebAuthn test authenticator, including pending-state recovery after restarting the app.
- Avatar, display name, bio, theme and accent editing, with database verification of saved values.
- SecureStore session persistence and profile appearance after app relaunch.
- Stale-save rejection and explicit profile reload.
- Revocation of another session while retaining the app session; sign-out everywhere; zero active sessions in the database; signed-out state after relaunch.
- Readable status bar in dark mode and feedback visible below the scrolling content.

The fixture is `apps/api/test/ios-local-handoff.mjs`. It accepts the app's pending `http://localhost:3200/mobile-connect?...` URL and an explicit simulator UDID, registers through the real signed WebAuthn endpoint, requests the normal PKCE-bound grant, and delivers the callback. It creates no authentication bypass in the app or API. Run it only with the isolated test servers and clean up its exact test identity afterward (the public UUID/handle are written to ignored `artifacts/ios-test-identity.json`). The simulator test identity used in this run was removed after verifying logout.

Apple/iCloud passkey creation and browser-sheet cancellation were not validated: automation could observe the embedded browser but could not interact with its controls. The signed software authenticator verifies protocol handling; it does not verify Apple's credential provider. Physical-device and release-domain validation remain separate release checks.

### Running development alongside the ads app

For normal Circle.social development when the ads app owns port 3000, use separate terminals (these commands use the normal Circle.social development database, not the test database):

```sh
WEB_ORIGIN=http://localhost:3200 pnpm --filter api dev
```

```sh
CIRCLE_API_URL=http://127.0.0.1:3001 CIRCLE_WEB_ORIGIN=http://localhost:3200 pnpm --filter web exec next dev --webpack --port 3200
```

```sh
EXPO_PUBLIC_API_URL=http://127.0.0.1:3001 EXPO_PUBLIC_WEB_URL=http://localhost:3200 ~/.local/bin/mise exec ruby@3.4.12 -- pnpm --filter mobile ios
```

Use `http://localhost:3200` consistently for browser passkeys. The local RP ID remains `localhost`. Stop these development servers before running Playwright, which reserves 3200/3201 for isolated tests.
