# Custom App Theme Studio

Open **Your profile → App themes → Create Your Own Theme** on web or mobile. The six existing background presets and the separate light/dark/system controls remain intact. They have not been rewritten as six new token palettes.

The web studio has controls, an interactive Feed/Community/Profile/Post preview with phone/desktop widths, and theme details. Short screens keep the preview and Save/Apply actions in view while controls scroll. Native uses the same validated configuration, a fixed preview, native sliders and a HEX/RGB picker; tablet layouts place the details alongside the preview.

Backgrounds support solid, linear/radial gradients with two to five movable color stops, dots/grid/waves patterns, grain texture and an optional owned image. Images use the existing authenticated media pipeline (normalization, 12 MiB upload maximum and 100 MiB account media quota), with a maximum 15% overlay for legibility. Opacity, intensity and direction are adjustable. Typography uses installed Inter, Chillax or system fonts with constrained size/line height. Component tokens include buttons, inputs, navigation, cards, dividers, radius, shadows and reduced motion. The Circle mark and orange wordmark remain canonical.

Save stores a draft theme in the account library. Apply explicitly installs a validated snapshot of that theme for the entire app. Editing and saving an already active theme does **not** change its applied snapshot until Apply. Undo/Redo history is local (50 changes); Duplicate creates an independent theme. Delete is recoverable for 30 days and removes an active selection immediately. Choosing any original background restores the existing appearance without deleting saved themes. JSON storage is capped at 2 MiB per account rather than a fixed number of themes. Deleted items count against the budget during their recovery window and are pruned on the next save after expiry.

## Data and API

`CustomTheme` stores owner, name, description, versioned JSON, byte size, revision and an optional owned image relation. `User` stores the selected theme relation, private applied snapshot, applied image relation and an independent selection revision. Public post authors and community projections do not expose these fields. User-row locks serialize theme selection and mutation; optimistic revisions reject stale writes. Theme changes have an additional 30/minute/account limit.

All endpoints require a current session; writes require the configured Origin. Web uses the existing `/api/v1` proxy and native the existing `/v1` API:

- `GET themes`, `GET themes/state`
- `POST themes` with `{name, description, config}`
- `PATCH themes/:id` with the draft and expected `revision`
- `POST themes/:id/duplicate` with `{}`
- `POST themes/:id/apply` with expected `themeVersion`
- `POST themes/default` with expected `themeVersion` and original `backgroundId`
- `DELETE themes/:id`, `POST themes/:id/restore` with expected `revision`

No CSS, arbitrary URLs, HTML, SVG or script is accepted. The strict v1 schema allows only six-digit HEX colors, bounded numeric values and enumerated effects/fonts/backgrounds. Safe SVG backgrounds are generated from allowlisted values on both clients. Unsupported or malformed stored configurations fall back safely; unreadable combinations cannot be saved or applied. Ordinary text is checked at 4.5:1 against every relevant surface and sampled gradient, button text at 4.5:1 against its fill, and input boundaries at 3:1. User image brightness extremes are included in the contrast checks.

The shared `@circle/design-tokens` renderer drives both clients. Root CSS variables apply without reload on web; native semantic primitives apply through a shared external store. Private profile/state responses hydrate the selection after login, and browser focus/native foreground refresh it after changes on another device. Signing out clears only the local display, never saved themes. Both saved and currently applied image relations prevent draft cleanup; images in use cannot be discarded or attached to public posts.

## Verification

The isolated API suite covers palette safety, authentication, Origin, account isolation, strict JSON and contrast, optimistic revisions, explicit Save/Apply snapshots, duplicate/delete/restore/default, background image retention/ownership, fresh login and quota enforcement. Browser tests cover real account save/apply/default restoration, full onboarding regression, no-reload global tokens, editor controls, contrast rejection, reopening after reload and a pinned preview/actions at 390×680. iOS requires a development rebuild after adding the Expo-compatible native slider.


For manual iOS QA, `test/ios-theme-qa.mjs <simulator-UDID>` temporarily serves only a local handoff callback on port 3200 and seeds a disposable completed identity in `circle_social_test`. It requires the isolated API at 3201 and a native Metro bundle configured for that API. It never reads the native PKCE verifier or prints session credentials. Full onboarding remains covered by browser/API tests; this fixture is only for inspecting the authenticated native theme screens.
