# Changelog

All notable changes to LightClip are documented in this file.

This project follows semantic versioning. Breaking changes should be reserved for major versions and called out in release notes.

## Unreleased

No unreleased changes yet.

## [1.0.0] - 2026-07-03

### Changed

- Promoted the current LightClip build to the first stable `1.0.0` release.
- Rebuilt Windows installer and portable assets with `1.0.0` package metadata.

### Included

- Text clipboard history with search, filters, pinning, preview, deletion, and cleanup tools.
- Optional image and file history with local-only privacy defaults.
- Theme accent and light/dark appearance controls.
- Brotli-compressed local storage with configurable storage location.
- Startup registration cleanup for legacy development entries.

### Verified

- `pnpm typecheck`
- `pnpm build`
- `pnpm dist`
- Packaged startup smoke check.

## 0.1.4 - 2026-07-03

### Added

- Added Brotli-compressed local storage using compact JSON and maximum compression quality.
- Added settings controls to open, change, and reset the active storage directory.
- Added automatic migration from legacy `lightclip-store.json` to `lightclip-store.json.br`.
- Expanded source integrity checks to cover the storage and main-process IPC layers.

### Fixed

- Cleaned legacy development startup entries that could launch Electron's default welcome window.

### Verified

- `pnpm typecheck`
- `pnpm build`
- `pnpm dist`
- Packaged startup and compressed-store smoke check.

## 0.1.3 - 2026-07-02

### Added

- Added history filters for text, image, file, pinned, and all records.
- Added large preview modal for text, image, and file history items.
- Added JSON history import and export from user-selected files.
- Added retention-day cleanup for non-pinned history.
- Added store size visibility, category cleanup, shortcut reset, and temporary capture pause controls.
- Added the MIT License.

### Fixed

- Completed the shared settings/state contract for new retention and storage fields so startup does not depend on partially migrated renderer state.

### Verified

- `pnpm typecheck`
- `pnpm build`
- `pnpm dist`
- Production Electron startup smoke check.

## 0.1.2 - 2026-07-02

### Added

- Added theme accent switching with Mint, Blue, Violet, Rose, Amber options.
- Added persisted theme accent settings with validation and defaults for existing stores.

### Changed

- Unified the title bar and main panel color system through shared renderer CSS variables.
- Removed the traditional `File / Edit / View / Window` menu bar from the app UI and main-process IPC surface.
- Updated README copy for the new chrome and theme behavior.

### Verified

- `pnpm typecheck`
- `pnpm build`
- `pnpm dist`
- Production Electron startup smoke check.

## 0.1.1 - 2026-07-02

### Fixed

- Fixed blank packaged windows caused by absolute renderer asset paths in the `file://` environment.
- Changed Vite output to use relative asset paths.
- Cleaned old renderer assets during production builds.
- Ensured normal double-click launches show the panel, while startup launches can remain hidden in the tray.

## 0.1.0 - 2026-07-01

### Added

- Initial Electron, Vue 3, TypeScript, Vite, and pnpm app scaffold.
- Text clipboard history with search, pin, copy, delete, and clear-unpinned workflows.
- Optional image and file history capture.
- Windows tray integration and global shortcut support.
- Startup registration setting.
- Windows installer and portable packaging through `electron-builder`.

[1.0.0]: https://github.com/leaf-zly/lightclip/releases/tag/v1.0.0
