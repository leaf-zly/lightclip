# LightClip v2.2.0

This feature release adds secure in-app updates, a compact Win+V-inspired panel, reliable atomic paste input, and target-monitor placement.

## Added

- Signed online update checks backed by GitHub Releases, including release notes, download progress, signature verification, installation, and relaunch.
- Standard and compact interface modes with a toolbar shortcut and persisted setting.
- Target-monitor placement based on the foreground window captured when LightClip opens.
- DPI-aware standard and compact window geometry across multi-monitor Windows setups.

## Fixed

- Replaced sequential legacy keyboard events with one atomic User32 `SendInput` transaction so paste-after-copy cannot degrade into a lone `v`.
- Compact image history now uses thumbnail-sized previews and keeps the history list dense.
- Changing interface mode updates both the renderer layout and native window geometry immediately.

## Verification

- Renderer updater utility tests, source integrity, TypeScript, and production renderer build.
- Rust tests for panel positioning and native Windows input structure layout.
- GitHub-hosted Tauri compilation, signed updater artifact generation, NSIS packaging, native Alt+V activation, and exact focused-textbox paste verification.

## Downloads

- `LightClip_*_setup.exe`: recommended current-user installer and online-update target.
- `LightClip-portable-x64.exe`: standalone application binary.

Updater artifacts are signed with the Tauri updater key. Windows executables are not Authenticode-signed, so SmartScreen or third-party antivirus products may still show an unknown-publisher warning.
