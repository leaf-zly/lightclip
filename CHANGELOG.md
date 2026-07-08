# Changelog

All notable changes to LightClip are documented in this file.

This project follows semantic versioning. Breaking changes should be reserved for major versions and called out in release notes.

## Unreleased

### Fixed

- Avoid restoring normal or maximized target windows during paste-after-copy focus recovery, preventing size changes and reducing visible flicker.

## [1.2.5] - 2026-07-08

### Fixed

- Fixed paste-after-copy cases where LightClip copied the selected history item but failed to paste it back into the app that opened the panel.
- Captured the focused child control together with the foreground window before the panel opens.
- Restored the target app focus through Windows input-thread attachment before sending `Ctrl + V`.

### Verified

- `pnpm typecheck`
- `pnpm build`
- `pnpm dist`
- Full source E2E: isolated LightClip instance, real WinForms target input, real `Alt + V`, real item selection, verified target textbox content.
- Full packaged E2E against `release\win-unpacked\LightClip.exe` with the same target-input flow.

## [1.2.4] - 2026-07-06

### Fixed

- Reworked paste-after-copy to capture the foreground window before the LightClip panel opens.
- Reactivated the captured target window before sending `Ctrl + V`, fixing cases where the paste command had no visible effect.
- Replaced the warm Windows Script Host helper with a warm PowerShell Win32 helper that can capture, restore, and paste through one stdin command loop.

### Verified

- `pnpm typecheck`
- `pnpm build`
- `pnpm dist`
- Packaged startup smoke check.
- Paste helper capture/quit smoke check.

## [1.2.3] - 2026-07-06

### Fixed

- Replaced per-paste PowerShell startup with a warm Windows Script Host helper for paste-after-copy delivery.
- Started and stopped the paste helper with the paste-after-copy setting so the helper only runs when the feature is enabled.
- Kept automatic paste delivery asynchronous so it cannot block the Electron main process.

### Verified

- `pnpm typecheck`
- `pnpm build`
- `pnpm dist`
- Packaged startup smoke check.
- Paste helper quit smoke check.

## [1.2.2] - 2026-07-06

### Fixed

- Made the quick panel hide immediately after selecting a history item instead of waiting for clipboard writes or encrypted store persistence.
- Moved copy-count persistence off the user-visible copy path while preserving state broadcasts after the background save completes.
- Reused the same clipboard signature format for polling and manual copy operations to avoid duplicate history records.

### Verified

- `pnpm typecheck`
- `pnpm build`
- `pnpm dist`
- Packaged startup smoke check.

## [1.2.1] - 2026-07-06

### Fixed

- Made theme accent and appearance changes apply immediately in the renderer instead of waiting for encrypted store persistence.

### Verified

- `pnpm typecheck`
- `pnpm build`
- `pnpm dist`
- Packaged startup smoke check.

## [1.2.0] - 2026-07-06

### Added

- Added staged history rendering to reduce initial DOM work for large history lists.
- Added lazy image decoding for image history rows and previews.
- Added manual GitHub Release update checks from Settings.
- Added allowlisted external release-page opening for update checks.
- Added GitHub Actions CI workflow for typecheck and build.
- Added manual GitHub Actions release-build workflow for Windows packaging artifacts.

### Changed

- Added package manager metadata for reproducible pnpm setup in CI.

### Verified

- `pnpm typecheck`
- `pnpm build`
- `pnpm dist`
- Packaged startup smoke check.

## [1.1.0] - 2026-07-06

### Added

- Added Windows account-backed local store encryption through Electron safeStorage.
- Added automatic migration from plain Brotli stores to encrypted Brotli stores when encryption is enabled and available.
- Added foreground app exclusions so configured process names are not captured.
- Added optional paste-after-select behavior that sends `Ctrl + V` after copying a history item.
- Added settings controls for local encryption, excluded apps, and paste-after-select.

### Changed

- Updated storage status labels to distinguish plain Brotli from encrypted Brotli storage.

### Verified

- `pnpm typecheck`
- `pnpm build`
- `pnpm dist`
- Packaged startup smoke check.

## [1.0.1] - 2026-07-06

### Added

- Added last-known-readable backup storage at `lightclip-store.json.br.bak`.
- Added startup recovery from the backup store when the primary compressed store is missing or unreadable.
- Added unreadable store quarantine using `.corrupt-*` suffixes before recreating a clean store.

### Fixed

- Prevented unavailable or invalid global shortcuts from being persisted.
- Restored the previous shortcut when a new shortcut cannot be registered.
- Refreshed renderer settings after failed setting saves so inputs match the persisted state.

### Verified

- `pnpm typecheck`
- `pnpm build`
- `pnpm dist`
- Packaged startup smoke check.

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

[1.2.5]: https://github.com/leaf-zly/lightclip/releases/tag/v1.2.5
[1.2.4]: https://github.com/leaf-zly/lightclip/releases/tag/v1.2.4
[1.2.3]: https://github.com/leaf-zly/lightclip/releases/tag/v1.2.3
[1.2.2]: https://github.com/leaf-zly/lightclip/releases/tag/v1.2.2
[1.2.1]: https://github.com/leaf-zly/lightclip/releases/tag/v1.2.1
[1.2.0]: https://github.com/leaf-zly/lightclip/releases/tag/v1.2.0
[1.1.0]: https://github.com/leaf-zly/lightclip/releases/tag/v1.1.0
[1.0.1]: https://github.com/leaf-zly/lightclip/releases/tag/v1.0.1
[1.0.0]: https://github.com/leaf-zly/lightclip/releases/tag/v1.0.0
