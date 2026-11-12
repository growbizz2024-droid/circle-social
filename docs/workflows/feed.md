# Connected feed foundation

The web home and native home share the black/orange Circle theme and icon paths. Feed, Discover, Communities and Profile navigate real account data. No sample posts or fabricated counters are seeded into the development database.

Completed users choose Text, Image or Audio, select a joined community and optionally tag up to five interests. Captions support 500 characters. Up to three gallery images can be attached, or one voice recording of up to two minutes. Web recording supports pause/resume, preview, delete and save; microphone permission is requested only on Start recording. Native uses SDK-compatible Expo ImagePicker and Audio, with a rebuilt development binary for the new modules.

For You matches joined communities or selected interests; Following shows followed authors; Trending orders the last seven days by genuine likes, reposts and comments, with newest posts breaking ties. This is a simple bounded feed foundation (30 posts), not the full paginated feed engine. Saved posts are private. Post links open an authenticated detail view. Comments show the latest 30 replies.

Likes, comments, reposts and follows create recipient-only activity. Saves never notify an author. Reaction requests set an explicit state and are idempotent. Owner removal hides a post immediately and offers Undo during the current screen session. Community owners must transfer ownership before leaving.

The additive `social_feed_actions` migration preserves users, passkeys, recovery, sessions and seeded community definitions. Authentication guards, origin validation and request limits apply to every action. Login location is never included in feed or activity projections.

Integration tests use only the isolated test database/Redis. Browser tests publish through the real composer, exercise reactions/comments, and capture mobile/desktop screenshots with temporary test data that is removed afterward.


Discover includes real seven-day topic counts, searchable public identities with follow controls, and community recommendations with actual active member counts. Community detail uses its stable cover and includes Join/Joined, Latest, Trending, About and real post totals. Post detail retains comments, reactions and private save actions.

## Authenticated media

`POST /v1/media` accepts a raw image/audio body up to 12 MiB from an authenticated, completed account with a valid Origin. Images are decoded with a 24-megapixel limit, resized to a maximum 1600 pixels and re-encoded as JPEG without source EXIF. Audio container metadata must identify supported audio and a finite duration from 0.2 to 120 seconds. Native AAC/M4A and browser PCM WAV are covered by integration tests. Animated images, SVG and arbitrary URLs are rejected.

This local foundation stores bounded media bytes in PostgreSQL for atomic attachment ownership and cascade cleanup; an external object store/CDN is not configured. The account quota is 100 MiB. Unpublished drafts expire after 24 hours and are pruned on the owner's next upload; clients delete discarded drafts immediately where possible. Published attachments cannot be reused or deleted as drafts. Serving requires a valid completed-account session and a visible active post, or ownership of a current unpublished draft. Removed posts no longer serve their media. Responses use private no-store caching, nosniff, and bounded byte ranges for playback. Media bytes and original filenames never appear in feed JSON or request logs.

For larger deployments, move bytes to a private object store behind the same authorization checks and schedule expired-draft cleanup independently of uploads. This checkpoint does not implement direct messages, push delivery, image editing or content moderation classifiers.
