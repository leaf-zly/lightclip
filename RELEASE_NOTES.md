# LightClip v2.2.3

This maintenance release improves panel placement for real-world Windows input controls and refreshes the signed-update experience.

## Fixed

- Rejects stale caret coordinates that fall outside the captured target window.
- Falls back to the mouse position captured when the shortcut is pressed when Chromium, WPF, WinUI, or a custom input does not expose a trustworthy system caret.
- Keeps the standard panel beside centered inputs on common 1366px laptop displays instead of covering the anchor.
- Scales native minimum panel dimensions consistently with the target monitor DPI.

## Improved

- Presents update status, current and available versions, and release notes in a clearer responsive dialog.
- Renders release notes as safe structured text instead of displaying raw Markdown.
- Keeps long notes scrollable while the update actions remain available.
- Adds Escape handling, initial keyboard focus, accessible live status, and copy-link confirmation.

## Verification

- Five updater utility tests, TypeScript and Vue type checking, and the renderer production build pass.
- GitHub-hosted Windows native release tests cover stale-caret fallback and centered-anchor placement.
- Update-dialog visual checks pass at 860x680 and 390x560 without horizontal overflow or overlapping controls.

## Downloads

- LightClip_2.2.3_x64-setup.exe: recommended current-user installer.
- LightClip-portable-x64.exe: standalone application binary.

Updater artifacts are signed with the Tauri updater key. Windows executables are not Authenticode-signed, so SmartScreen or third-party antivirus products may still show an unknown-publisher warning.
