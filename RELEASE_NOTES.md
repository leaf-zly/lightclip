# LightClip v2.0.2

This patch restores the `Alt+V` global shortcut and moves shortcut ownership into the Tauri Rust host.

## Fixed

- `Alt+V` no longer depends on an asynchronous callback registered by the hidden Vue WebView.
- The Rust host registers the configured shortcut during application startup and handles show/hide directly.
- Shortcut changes are validated against Windows before they remain persisted; failed changes restore the previous working shortcut.
- Renderer-side shortcut permissions and the unused JavaScript plugin dependency have been removed.

## Verification

- The packaged app is launched with `--hidden` on GitHub's Windows runner.
- The workflow sends a native `Alt+V` key sequence and requires the actual `LightClip` main window to become visible within three seconds.
- Rust serialization, 2.0.0 metadata migration, native target capture, source integrity, Vue/TypeScript, Tauri packaging, and dependency-lock checks remain enabled.

## Downloads

- `LightClip_*_setup.exe`: recommended current-user installer.
- `lightclip.exe`: standalone application binary.

Quit the existing LightClip tray process before replacing a standalone executable. Release binaries remain unsigned, so Windows SmartScreen or third-party antivirus products may show an unknown-publisher warning.
