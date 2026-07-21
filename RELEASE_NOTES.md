# LightClip v2.0.0

LightClip 2 replaces the bundled Electron runtime with Tauri 2 and Windows WebView2. The result is a substantially smaller Windows package while preserving the local clipboard workflow, tray behavior, appearance controls, and optional image/file history.

## Highlights

- Smaller Tauri 2 application and NSIS installer using the system WebView2 runtime.
- Text, PNG image, and native Windows file-drop clipboard history; image and file capture remain off by default.
- Search, filters, pinning, previews, retention limits, import/export, and configurable compressed storage.
- System/light/dark appearance and five full-interface accent themes.
- Tray controls, `Alt + V`, current-user startup registration, privacy exclusions, and optional paste-after-select.
- Official binaries built and published by GitHub Actions from this tagged source revision.

## Upgrade Notes

LightClip 2 stores data under `%APPDATA%\LightClip` by default. Readable plain Brotli and legacy JSON stores are migrated automatically.

Electron 1.x encrypted stores cannot be decrypted directly by Tauri 2.0. Before upgrading, export history to JSON from LightClip 1.x, then import the JSON file from LightClip 2 settings. Export files are unencrypted and should be protected accordingly.

## Downloads

- `LightClip_*_setup.exe`: recommended current-user installer.
- `lightclip.exe`: standalone application binary.

The installer downloads Microsoft's WebView2 bootstrapper only when the runtime is missing.

## Verification

- Source integrity check passed.
- Vue and TypeScript type checks passed with `pnpm typecheck`.
- Renderer production build passed with `pnpm build`.
- Rust compilation and NSIS packaging run on GitHub's `windows-latest` runner before publication.

## Security Notes

- Clipboard history remains local and no telemetry is included.
- Manual update checks contact the LightClip GitHub Releases API.
- Release binaries are not Authenticode signed yet. Windows SmartScreen or antivirus products may show an unknown-publisher warning or false positive despite the public build provenance.
- Paste-after-select and native file restoration depend on Windows PowerShell and can be restricted by enterprise policy.
