# Changelog

All notable changes to LightClip are documented in this file.

This project follows semantic versioning while it remains in early development. Breaking changes may still occur before `1.0.0`, but they should be called out in release notes.

## [0.1.2] - 2026-07-02

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

## [0.1.1] - 2026-07-02

### Fixed

- Fixed blank packaged windows caused by absolute renderer asset paths in the `file://` environment.
- Changed Vite output to use relative asset paths.
- Cleaned old renderer assets during production builds.
- Ensured normal double-click launches show the panel, while startup launches can remain hidden in the tray.

## [0.1.0] - 2026-07-01

### Added

- Initial Electron, Vue 3, TypeScript, Vite, and pnpm app scaffold.
- Text clipboard history with search, pin, copy, delete, and clear-unpinned workflows.
- Optional image and file history capture.
- Windows tray integration and global shortcut support.
- Startup registration setting.
- Windows installer and portable packaging through `electron-builder`.

[0.1.2]: https://github.com/leaf-zly/lightclip/releases/tag/v0.1.2
[0.1.1]: https://github.com/leaf-zly/lightclip/releases/tag/v0.1.1
[0.1.0]: https://github.com/leaf-zly/lightclip/releases/tag/v0.1.0
