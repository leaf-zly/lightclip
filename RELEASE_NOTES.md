# LightClip v2.3.0

LightClip v2.3.0 improves large-history responsiveness, paste feedback, panel placement, and the online update experience.

## Added

- Recent-history filter and structured search qualifiers: `type:`, `from:`, and `is:pinned`.
- Paste progress feedback with success and failure notifications.
- Cursor-adjacent panel placement on the active monitor with edge collision handling.

## Improved

- Debounced history search to keep typing responsive with hundreds of records.
- Immediate visual application of theme and layout settings.
- Compact and standard panel styling, including responsive image history rows.
- Update dialog hierarchy, release-note scrolling, progress feedback, and narrow-window behavior.
- Incremental history updates avoid replacing the complete history snapshot after every copy.

## Verification

- `pnpm check:sources`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build:renderer`
- `pnpm electron:build`

## Downloads

Windows installers and portable executables are published on the [GitHub Release page](https://github.com/leaf-zly/lightclip/releases/tag/v2.3.0).