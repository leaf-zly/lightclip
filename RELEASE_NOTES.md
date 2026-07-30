# LightClip v2.1.1

This patch prevents an obsolete Electron startup entry from launching a second LightClip runtime with a different icon after Windows restarts.

## Fixed

- Removes legacy `electron.app.LightClip` and `electron.app.Electron` values from the current-user Windows Run key.
- Keeps only the current Tauri `LightClip` launch-at-login entry.
- Prevents the retired Electron process and its old checklist icon from appearing after sign-in.

## Verification

- Rust tests for current and legacy startup registry arguments.
- GitHub-hosted Tauri compilation, NSIS packaging, native Alt+V startup, and real focused-textbox paste-after-copy testing.

## Downloads

- LightClip_*_setup.exe: recommended current-user installer.
- lightclip.exe: standalone application binary.

Quit the existing LightClip tray process before replacing a standalone executable. Release binaries remain unsigned, so Windows SmartScreen or third-party antivirus products may show an unknown-publisher warning.
