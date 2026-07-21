# LightClip v2.0.1

This patch fixes clipboard metadata display and removes the multi-second delay when opening LightClip from its global shortcut.

## Fixed

- History timestamps and copy counts now use the renderer's camelCase contract, eliminating `NaN/NaN NaN:NaN` labels.
- Existing metadata written by 2.0.0 is migrated from snake_case automatically.
- Image history receives the correct `dataUrl` and `byteSize` fields.
- Shortcut target capture now calls Windows User32 directly instead of starting PowerShell before showing the panel.
- Invalid timestamps fall back to `时间未知` rather than exposing a broken date.

## Verification

- Rust tests verify renderer-facing field names and 2.0.0 data migration.
- The native target-window capture path is checked to complete within 250 ms on GitHub's Windows runner.
- Source integrity, Vue/TypeScript checks, renderer production build, Tauri packaging, and packaged startup/store initialization run on GitHub Actions.

## Downloads

- `LightClip_*_setup.exe`: recommended current-user installer.
- `lightclip.exe`: standalone application binary.

Release binaries remain unsigned, so Windows SmartScreen or third-party antivirus products may still show an unknown-publisher warning.
