# LightClip v2.2.2

This maintenance release makes clipboard selection, focused-input placement, interface switching, and narrow layouts reliable.

## Fixed

- Restores the original focused control and sends an atomic Ctrl+V transaction so paste-after-copy inserts into the intended input without requiring another click.
- Converts caret client coordinates to screen coordinates and places the panel beside the focused caret across multi-monitor desktops, including negative monitor coordinates.
- Adapts the standard panel width near work-area edges instead of covering the caret.
- Switches between standard and compact modes without hiding the native window or exposing a white intermediate frame.
- Keeps filter controls, toolbar actions, image previews, and history rows aligned at narrow standard-panel widths.

## Verification

- Packaged Alt+V activation completed in 25 ms.
- The packaged panel opened 17 px from the focused caret.
- Packaged paste-after-copy restored the focused textbox and inserted the selected history item.
- TypeScript and Vue type checking, renderer tests, production build, Rust native tests, and GitHub-hosted Windows packaging pass.

## Downloads

- LightClip_2.2.2_x64-setup.exe: recommended current-user installer.
- LightClip-portable-x64.exe: standalone application binary.

Updater artifacts are signed with the Tauri updater key. Windows executables are not Authenticode-signed, so SmartScreen or third-party antivirus products may still show an unknown-publisher warning.
