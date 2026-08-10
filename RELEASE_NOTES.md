# LightClip v2.2.1

This maintenance release improves update recovery, focused-input placement, paste reliability, and panel layout stability.

## Fixed

- Places standard and compact panels beside the focused input caret on multi-monitor desktops, including negative monitor coordinates and work-area edge fallback.
- Sends WM_PASTE directly to the captured focused control before falling back to an atomic Ctrl+V input transaction.
- Prevents interface-mode switching from exposing intermediate native window sizes.
- Keeps the standard filter row, toolbar, and history list stable with large clipboard histories.
- Replaces the title-bar mark with a dedicated small-size icon.
- Converts updater transport failures into readable messages and provides browser-download and copy-link fallbacks.

## Improved

- Limits silent startup update checks to once every six hours and uses a short connection timeout.
- Preserves compatibility with paste targets captured by earlier 2.x builds.

## Verification

- TypeScript and Vue type checking.
- Renderer unit tests and production build.
- Twelve Rust native tests, including multi-monitor caret positioning.
- GitHub-hosted Windows NSIS packaging.
- Packaged Alt+V activation and exact focused-textbox paste smoke testing.

## Downloads

- LightClip_2.2.1_x64-setup.exe: recommended current-user installer.
- LightClip-portable-x64.exe: standalone application binary.

Updater artifacts are signed with the Tauri updater key. Windows executables are not Authenticode-signed, so SmartScreen or third-party antivirus products may still show an unknown-publisher warning.