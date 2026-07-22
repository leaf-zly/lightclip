# Changelog

All notable changes to LightClip are documented in this file.

This project follows semantic versioning. Breaking changes should be reserved for major versions and called out in release notes.

## Unreleased

## [2.1.0] - 2026-07-22

### Added

- Added multi-term and quoted-phrase search with relative time filtering.
- Added reusable pinned snippets and direct selection of the first nine filtered items with Ctrl plus a number key.
- Added optional local sensitive-content filtering for credentials, verification codes, payment-card numbers, and custom keywords.
- Added configurable rolling backups, a storage payload limit, and on-demand storage optimization.

### Changed

- Storage deduplication now preserves pinned snippets before newer regular duplicates.
- Capacity trimming removes only the oldest non-pinned records and stops when only pinned snippets remain.
- Normalized repository line endings to avoid source corruption across Windows PowerShell and PowerShell 7 workflows.

### Verified

- Added Rust tests for sensitive-content detection and pinned-item storage protection.
- Retained source-integrity, TypeScript, renderer production build, Cargo lock, Tauri host, packaged shortcut, and real textbox paste tests.

## [2.0.3] - 2026-07-22

### Fixed

- Replaced the per-paste PowerShell process with direct Win32 focus restoration and keyboard input, removing process startup latency from paste-after-copy.
- Waits for the LightClip WebView to finish hiding and verifies the captured target is foreground before sending `Ctrl+V`, so users no longer need to refocus the destination manually.
- Restores the previously focused child control while avoiding restore operations on normal or maximized target windows.

### Verified

- Extended the packaged Windows end-to-end test with a real focused WinForms textbox.
- The release now requires the packaged app to open through native `Alt+V`, select a known history item, restore the original textbox, and insert the item without manual focus changes.
- Retained source integrity, PowerShell 5/7 parsing, TypeScript, renderer build, Rust host tests, and Tauri packaging checks.

## [2.0.2] - 2026-07-21

### Fixed

- Moved global shortcut registration from the hidden Vue WebView to the Tauri Rust host so `Alt+V` remains active independently of renderer lifecycle and permissions.
- Re-registers changed shortcuts in the Rust host and rolls back the persisted setting when Windows rejects a shortcut.
- Removed renderer-side global-shortcut permissions and dependencies to keep one authoritative shortcut owner.

### Verified

- Added a packaged end-to-end shortcut test that launches LightClip hidden, sends native `Alt+V`, and requires the real main window to become visible within three seconds.
- Retained Rust metadata migration, serialization, and native target-capture regression tests.

## [2.0.1] - 2026-07-21

### Fixed

- Fixed Tauri clipboard metadata serialization so timestamps, copy counts, image data URLs, and image byte sizes reach the renderer with camelCase field names.
- Migrated snake_case clipboard metadata written by 2.0.0 without losing timestamps or copy counts.
- Replaced synchronous PowerShell target-window capture with direct User32 calls, removing the multi-second delay before the shortcut panel appears.
- Added a defensive renderer fallback so malformed timestamps display as `时间未知` instead of `NaN/NaN NaN:NaN`.

### Verified

- Rust serialization and legacy-data migration tests.
- Native shortcut-path target capture completes within 250 ms in the GitHub Windows test environment.
- GitHub-hosted typecheck, renderer build, Tauri packaging, and packaged startup smoke test.

## [2.0.0] - 2026-07-21

### Added

- Added a Tauri 2 Windows runtime backed by the system WebView2 installation.
- Added GitHub-hosted Windows packaging with branch artifacts and automatic `v2.*` GitHub Release publication.
- Added Tauri clipboard capture and restoration for text, optional PNG images, and optional native file-drop lists.
- Added Tauri tray controls, current-user startup registration, global shortcut handling, update checks, and storage-directory management.
- Added normalized legacy-store parsing, backup recovery, corrupt-store quarantine, and same-directory temporary writes.

### Changed

- Reduced the installed runtime footprint by removing Electron from the 2.0 application package.
- Moved official native packaging to GitHub Actions so released binaries are traceable to public source and workflow logs.
- Changed the default data directory to `%APPDATA%\LightClip` while retaining readable legacy Tauri preview data.
- Changed `pnpm build` to perform source and renderer verification without generating a native executable.

### Fixed

- Avoided restoring normal or maximized target windows during paste-after-copy focus recovery, preventing size changes and reducing visible flicker.

### Security

- Image and file capture remain opt-in.
- External URL opening remains restricted to the LightClip GitHub repository.
- Tauri 2.0 does not expose Electron account-backed store encryption; encrypted 1.x users must export JSON before upgrading.

### Verified

- `pnpm typecheck`
- `pnpm build`
- GitHub-hosted Rust compilation, NSIS packaging, and packaged startup smoke testing.

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

[2.1.0]: https://github.com/leaf-zly/lightclip/releases/tag/v2.1.0
[2.0.3]: https://github.com/leaf-zly/lightclip/releases/tag/v2.0.3
[2.0.2]: https://github.com/leaf-zly/lightclip/releases/tag/v2.0.2
[2.0.1]: https://github.com/leaf-zly/lightclip/releases/tag/v2.0.1
[2.0.0]: https://github.com/leaf-zly/lightclip/releases/tag/v2.0.0
[1.2.5]: https://github.com/leaf-zly/lightclip/releases/tag/v1.2.5
[1.2.4]: https://github.com/leaf-zly/lightclip/releases/tag/v1.2.4
[1.2.3]: https://github.com/leaf-zly/lightclip/releases/tag/v1.2.3
[1.2.2]: https://github.com/leaf-zly/lightclip/releases/tag/v1.2.2
[1.2.1]: https://github.com/leaf-zly/lightclip/releases/tag/v1.2.1
[1.2.0]: https://github.com/leaf-zly/lightclip/releases/tag/v1.2.0
[1.1.0]: https://github.com/leaf-zly/lightclip/releases/tag/v1.1.0
[1.0.1]: https://github.com/leaf-zly/lightclip/releases/tag/v1.0.1
[1.0.0]: https://github.com/leaf-zly/lightclip/releases/tag/v1.0.0
