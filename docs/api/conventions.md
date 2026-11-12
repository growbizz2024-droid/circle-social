# API conventions

All application routes are under `/v1`. Successful responses are `{ data, requestId }`; failures are `{ error: { code, message }, requestId }`. Internal exception messages, query strings, credentials and database errors are never returned. Request IDs accept only 1–64 ASCII alphanumeric/underscore/hyphen characters; others are replaced. `X-Request-ID` correlates safe structured request logs. All responses disable caching.

Zod validates external inputs; unknown fields are rejected on application DTOs. `GET /communities?limit=20&cursor=UUID` supports bounded cursor pagination with `{items,nextCursor}`. No arbitrary writes or open user-list endpoint exists.

## Routes

- `GET /v1/health/live`: process liveness.
- `GET /v1/health/ready`: PostgreSQL, Redis and queue availability; 503 on failure.
- `GET /v1/health/metrics`: internal Prometheus metrics.
- `GET /v1/communities`: active community summaries.
- `POST /v1/auth/registration/options`: `{handle}`; passkey creation options and HttpOnly challenge cookie.
- `POST /v1/auth/registration/verify`: browser WebAuthn registration response; establishes session.
- `POST /v1/auth/authentication/options`: discoverable credential request options.
- `POST /v1/auth/authentication/verify`: signed assertion; establishes session.
- `GET /v1/auth/me`: current pseudonymous identity.
- `GET /v1/auth/sessions`: non-secret session metadata.
- `DELETE /v1/auth/sessions/:id`: revoke an owned session.
- `GET /v1/auth/passkeys`: non-secret credential metadata.
- `DELETE /v1/auth/passkeys/:id`: remove an owned passkey after recent authentication; last key cannot be removed.
- `POST /v1/auth/logout`: revoke current session.
- `POST /v1/auth/logout-all`: revoke all owned sessions.

Browser credential calls must use `credentials: include` and the exact configured Origin. Do not put session tokens into localStorage, URLs or logs. The server currently uses cookies; the typed client's optional Authorization header is a future transport capability and is not a supported bearer-token login API.

OpenAPI is generated from Nest controllers at `/docs` and `/docs-json` in development only. The generated JSON is in `docs/api/openapi.json`. Inputs for WebAuthn are library-standard JSON; see the SimpleWebAuthn browser package for ceremony serialization. Mobile passkey integration needs a separate native origin/association design before shipping; this foundation verifies server-side protocol behavior only.
