# Offline approximate login locations

Run `pnpm geoip:setup` from the repository root to install the current public DB-IP City Lite MMDB database. A particular monthly release can be selected with `pnpm geoip:setup 2026-11`. Restart the API after installation or updates. The running API keeps its validated in-memory database until restart, so a bad on-disk update cannot interrupt authentication. Refresh the data monthly.

The database and release metadata are ignored by Git. The download script fetches only the public database, validates it with the reader before replacing the prior file, and records a local SHA-256 digest. No user IP or credential is sent in the download request. The API makes no external GeoIP lookup requests.

Data source: [DB-IP City Lite](https://db-ip.com/db/download/ip-to-city-lite), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The web and mobile session-history views include the required [IP Geolocation by DB-IP](https://db-ip.com) attribution. Data fields follow the [official MMDB schema](https://db-ip.com/db/format/ip-to-city-lite/mmdb.html); latitude, longitude, postal codes and subdivisions are discarded.

## Deployment

`GEOIP_DATABASE_PATH` sets an absolute path on the API server. The local default is `../../infrastructure/geoip/dbip-city-lite.mmdb` relative to the API working directory. A missing/corrupt database never blocks authentication; location is unavailable instead. Test mode does not load the real database unless this variable is explicitly set, so CI uses deterministic fixtures.

For direct API clients, only a globally routable socket-peer IP is eligible. Loopback, private, reserved, multicast and link-local addresses are not geolocated. IPv4-mapped private addresses and zone identifiers are excluded. Never infer a city from localhost or a device time zone.

For web traffic, Next.js's standard Request does not reliably expose the client socket. Configure a trusted ingress rather than trusting browser forwarding headers:

1. At the ingress, strip/overwrite a single-address client IP header and prevent clients from bypassing the ingress to reach Next.js directly.
2. Set web `CIRCLE_TRUSTED_CLIENT_IP_HEADER` to the header your ingress guarantees: `cf-connecting-ip`, `x-real-ip` or `x-vercel-forwarded-for`. Do not use a client-controlled header or a comma-separated proxy chain. Do not enable a Cloudflare header unless traffic is restricted to your Cloudflare ingress.
3. Set the same random, server-only secret (at least 32 characters) in API `GEOIP_PROXY_SECRET` and web `CIRCLE_GEOIP_PROXY_SECRET`. Use a secret manager; never put it in `NEXT_PUBLIC_*` or mobile environment variables.
4. Restart the servers. The BFF signs IP + timestamp + request method + API path. The API validates the HMAC and its thirty-second freshness window; arbitrary `Forwarded`, `X-Forwarded-For`, raw location headers and forged/stale signatures are ignored. The BFF never forwards a caller's internal proof headers.

Without this deployment configuration, web requests through a loopback BFF correctly show “Location unavailable”. Local development cannot derive a person's public city from a loopback address. Deployments behind public reverse proxies must configure the trusted boundary to avoid describing the proxy's own network as the client. Authentication IP throttling is unchanged; the location proof is metadata, never an authentication or eligibility factor.

## Privacy and retention

Only a city (when available), country name and country code are snapshotted on a successful session creation. No raw IP, coordinates or provider payload are stored on the session or added to logs, profiles, posts, public community responses or audit events. The existing short-lived Redis IP rate-limit keys remain unchanged.

Only the authenticated account can list its active session locations. Existing sessions have no historical backfill. VPNs, mobile carriers and geolocation database errors can show another city, so the UI labels results approximate. Normal login still succeeds if location cannot be established.

Logout, session revocation, account deactivation and recovery revoke access and erase the affected snapshots. Expired snapshots are cleared at API startup and at most every six hours while the API is running. Authentication/audit records themselves are preserved. Public database assets are not personal login data.
