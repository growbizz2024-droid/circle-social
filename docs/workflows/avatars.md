# Circle Avatar Engine — version 1

One `UserAvatar` belongs to one user and follows their identity across all communities. Existing `avatarId` remains in the legacy API contract; the procedural `avatar` specification is the display source. Passkeys, sessions, handles and memberships are preserved.

## Architecture

`@circle/avatar-engine` is a platform-independent, deterministic layered SVG renderer. It includes nine modular attributes: style, head, body, skin tone, hairstyle, hair color, outfit, accessory and background. The current catalog has over eleven million trait combinations. Random seeds come from the platform CSPRNG; repeated local generation avoids the current configuration. The authenticated candidate endpoint also checks existing configurations. Custom choices may intentionally match another person's traits; seeds identify the reproducible specification, not a credential.

Shading, cloth details, inclusive skin palettes and faceless/abstract/expressive busts create fictional characters without AI or real-person likenesses. The avatar accent uses `#FF5A0A`. Version 1 geometry must remain stable; future incompatible geometry requires a new version and an explicit migration. Unsupported or corrupt specifications fall back deterministically to a safe supported avatar.

Web renders a local SVG data URI; React Native renders the same SVG with the SDK-compatible `react-native-svg`. No user HTML, SVG, URLs or arbitrary colors enter the renderer. Both configuration and registration inputs use shared strict allowlists. The engine also validates untrusted renderer input independently of Zod. SVG/PNG exports are generated from fixed code and cached in a bounded private server cache.

## Persistence and lifecycle

The additive `user_avatars` migration stores seed, initial/default seed, JSON configuration, engine version, revision and timestamps. A unique user relation prevents per-community duplicates. A selected onboarding preview is bound to the server registration challenge, then saved atomically with the verified new user and passkey. Requests to add a backup passkey do not alter avatars.

Run `pnpm --filter api db:avatars:backfill` after migrating and building the API to populate missing records for existing users. It is idempotent and preserves existing avatar records, profile choices and credentials. A profile/avatar read also fills a missing record safely for legacy accounts. The fallback seed is a one-way digest rather than an exposed account UUID.

Onboarding now includes an avatar preview after username selection and before passkey setup. Generate Again, nine customization controls, reset, save and skipping customization are supported locally before authentication. Native browser-auth handoff carries the selected specification through strict validation. Profile editors stage changes locally; Cancel has no server effect, and saving an avatar preserves unsaved profile text. Reset restores the generated configuration from the original default seed. Avatar revisions are independent of profile revisions and reject concurrent stale saves.

## Versioned API

All routes below use the existing `/v1` API prefix and `/api/v1` web proxy. Every route requires an active authenticated identity; mutations also require the configured Origin.

- `POST avatars/generate` with `{}`: unsaved random candidate.
- `GET avatars/me`: own current specification, default seed and revision.
- `PATCH avatars/me`: complete allowlisted specification plus expected revision.
- `POST avatars/me/randomize` with expected revision: persist a random candidate.
- `POST avatars/me/reset` with expected revision: persist the original generated default.
- `GET avatars/me/export/svg` or `png`: private download with ETag; PNG is 512×512.

Generation/mutation requests are limited to 20 per minute per account in addition to global HTTP limits. Preview changes are local and do not consume server requests. Rendered assets survive logout because the configuration remains in PostgreSQL; logging out never resets or deletes it. Public author projections contain only the display specification, excluding the avatar database ID, user ID, default seed and revision.

## Verification

Engine tests cover determinism (including JSON key order), seeded diversity, every layer option, standalone safe SVG, unsupported versions and malicious configuration. API tests cover automatic registration, chosen preview persistence, ownership, Origin, cancel semantics, cross-device revision conflicts, randomize/reset, strict input, safe exports, cross-community consistency, fallback and throttling. Browser tests exercise onboarding and profile editing while preserving authentication, onboarding gates and unsaved profile text. iOS requires a rebuilt binary for the SVG native module; native iOS/Android exports use the same engine.

The editor uses a focused fixed-height layout: desktop preview on the left, phone preview above, independently scrollable options and persistent Save/Cancel actions. The short-viewport browser regression verifies the preview position remains unchanged while scrolling to the final option. Native uses a single full-screen modal with the same fixed-preview/scrolling-options structure.
