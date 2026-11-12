# Circle.social brand foundation

The supplied brand identity boards are the visual reference for the existing identity experience on web and mobile. The foundation uses an open-circle-and-dot mark, rounded Chillax headings, Inter body text, and the tagline “Real People. Open Conversations.” This checkpoint styles existing flows; onboarding, feeds, recovery and other mockup features remain in their respective product milestones.

## Color and appearance

Primary orange is `#FF6A00`; orange light is `#FFA552`. Dark backgrounds use `#0B0B0B`, surfaces `#1A1A1A`, borders `#2A2A2A`, white primary text and `#A3A3A3` secondary text. Light mode uses warm `#FFF7ED` with white surfaces and dark text. Primary orange buttons use dark labels for readable contrast. Large orange text gets a darker variant on light backgrounds.

Shared semantic tokens live in `packages/design-tokens`. The unauthenticated experience defaults to the dark brand presentation. Authenticated users retain their saved SYSTEM/LIGHT/DARK preference and personal accent; personal accents do not recolor the brand logo or primary actions. No account data or schema changes are needed for this visual update.

## Logo assets

`assets/brand/circle-mark.svg` is the code-native vector reconstruction from the supplied reference, with raster exports for mobile and app icons. Web and mobile have reusable mark/wordmark components. The mark keeps its aspect ratio; reserve clear space around it and use orange on dark/cream surfaces. The favicon and app icon use the same mark. Re-export raster icons with `node infrastructure/scripts/export-brand-icons.mjs` (requires installed Playwright Chromium); refresh the corresponding component path when changing the canonical geometry. Regenerate native projects with Expo after changing the configured app icon.

## Fonts and first setup

Run `pnpm brand:assets` once after dependency installation. It retrieves Chillax directly from the official Fontshare package and verifies each required file against its expected SHA-256. These private build assets are Git-ignored because Fontshare permits application embedding/self-hosting but restricts redistribution of raw fonts through repositories. Review `assets/brand/FONTSHARE-LICENSE.txt` and obtain fonts from [Fontshare](https://www.fontshare.com/fonts/chillax); do not commit the ignored raw Chillax files or use this repository as a font distribution service.

Inter is bundled under its SIL Open Font License, preserved in `assets/brand/INTER-LICENSE.txt`, from the [Google Fonts Inter source](https://github.com/google/fonts/tree/main/ofl/inter). Web loads local files through `next/font/local`. Mobile loads the same brand family through Expo Font and a local semibold face. The fonts are part of the application bundle; there is no runtime request to Google Fonts or Fontshare.

`pnpm build` and `pnpm dev` verify local assets with `--offline`; they do not download fonts. CI runs the one-time asset setup before its build. If an official font file changes upstream, setup stops on a hash mismatch so the new file and license can be reviewed deliberately. A developer who already has the assets can build offline, subject to the rest of the toolchain's installed dependencies.

## Verification

The existing browser test captures desktop and narrow-screen brand previews, then exercises real virtual-authenticator registration/login, profile editing, conflict handling, mobile grant exchange and deactivation. Screenshot artifacts are local and ignored by Git. Native previews use the dedicated Circle.social simulator. The five canonical communities, stable handles, passkey rules and session authorization are unaffected by mockup examples or copy.

The branded native Debug build passed on the dedicated iPhone 17 Pro simulator (iOS 26.5), including local font loading and layout review. Xcode reported zero errors and the same two dependency warnings documented in the identity milestone. Simulator display capture required a reboot before the final visual check; application or system security controls were not disabled.
