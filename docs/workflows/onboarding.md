# Milestone 1.2 — Complete onboarding

The canonical sequence is fourteen stages:

1. Splash and session check.
2. Welcome / Get Started.
3. Optional gender (including Skip and Prefer not to say).
4. Vibe.
5. Curated background.
6. Appearance preview, labeled sample content.
7. Username.
8. Signed passkey registration.
9. Generate, save and confirm a recovery credential.
10. Optional multiple interests.
11. The five canonical communities, with descriptions; choose any or explore first.
12. Final profile review: username, avatar, vibe, background, interests and selected communities.
13. Registration completion receipt.
14. Personalized home feed.

A successful passkey creates the identity and its authenticated session. That session permits finishing setup; it cannot enter the feed until `onboardingCompletedAt` is set by server validation. Completion requires an owned passkey, a confirmed unexpired recovery credential, validated preferences and available community IDs. Membership insertion, preferences, completion timestamp, version increment and audit event are one transaction. Empty interests and communities are intentional supported choices. No second identity or community-specific accounts are created.

Returning users have a separate short passkey login. Valid completed sessions go directly home; incomplete registrations resume setup. Profile style/interests remain editable without repeating registration. Existing accounts and community IDs/slugs are retained.

## Recovery security

`POST /auth/recovery/issue` requires a session authenticated within five minutes. It generates 32 cryptographically random bytes and a public UUID selector. Only a domain-separated SHA-256 verifier is stored. The plaintext is returned once with `Cache-Control: no-store`; it is held only in UI memory, never sessionStorage, SecureStore, logs or database rows. Copy and download require explicit user actions. Credentials expire after one year.

Pending issuance does not invalidate a confirmed credential. `POST /auth/recovery/confirm` proves possession of the generated credential, activates it and revokes older credentials atomically. The user must confirm saving it in the UI. Reloading loses the unconfirmed display; regenerate if it was not saved. Existing confirmed credentials remain usable until replacement confirmation succeeds.

Account recovery uses `POST /auth/recovery/options` and `/verify`, with an expiring HTTP-only challenge cookie. A code must be confirmed, unused, unrevoked and unexpired, and the account active. It is not consumed by requesting options or failing authenticator verification. Successfully registering a new passkey atomically consumes it, retains existing passkeys, revokes previous sessions and writes an audit event. Concurrent redemptions have one winner. The recovered account then generates a fresh recovery credential. Username alone is never authentication. Normal passkey management still prevents removal of the last key.

All mutations retain Origin checks and authentication rate limits. Follow [OWASP recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html). The one-year offline credential lifetime differs from the five-minute challenge lifetime and thirty-second mobile handoff lifetime.

## Feed boundary

`GET /feed` requires completed onboarding. It reads real posts from active authors and communities, matching joined community IDs or selected interest tags, newest first, limited to thirty. With no selections it returns recent public community posts for exploration. An empty database produces an explicit empty state, never synthetic posts. Publishing, ranking, pagination, moderation and full community management remain their later Phase 1 milestones.

## Local mobile flow

The existing PKCE browser handoff is retained. Native personalization is passed as validated non-secret preferences to the browser. After passkey registration the browser completes recovery, interests, communities and review; only then does it offer the existing app-session consent. The native app exchanges the one-use grant, clears its completed draft and enters its home feed. This is local development authentication; native release associated-domain requirements are unchanged.

## Verification

Use `pnpm test:integration` for isolated PostgreSQL/Redis tests, and `pnpm test:e2e` for the complete signed browser passkey journey. Recovery tests cover hashed storage, confirmation gating, pending rotation, invalid and concurrent redemption, session revocation, membership atomicity and real feed filtering. Browser tests exercise save confirmation, download, same-identity resume after session loss, all five communities, final review, completion, home, existing login and PKCE handoff. The serial browser harness resets only exact local test rate-counter keys in Redis DB 1 between journeys; production limits are unchanged. Never capture a recovery secret in deliverable screenshots or commit downloaded credentials.
