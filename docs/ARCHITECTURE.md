# Architecture

LightClip 2 is a Tauri 2 desktop application with a Vue 3 renderer and a Rust host. It uses the Windows WebView2 runtime instead of shipping an embedded browser engine.

## Runtime Boundaries

| Layer | Location | Responsibility |
| --- | --- | --- |
| Renderer | `src/renderer` | Search, filters, previews, settings, themes, keyboard interaction, and user feedback. |
| Shared contract | `src/shared` | Typed application state, clipboard item, settings, and command result shapes. |
| Tauri host | `src-tauri/src` | Clipboard access, history persistence, tray, startup registration, window lifecycle, focus restoration, and allowlisted external actions. |
| Bundle configuration | `src-tauri/tauri.conf.json` | Window policy, icons, NSIS target, and WebView2 bootstrap behavior. |
| Release automation | `.github/workflows/tauri-2-build.yml` | Reproducible Windows compilation, artifact upload, and tagged GitHub Release publication. |

The legacy Electron implementation remains under `src/main` and `src/preload` for 1.x maintenance. Tauri 2 packages do not include that runtime.

## Command Boundary

The renderer obtains a `LightClipApi` from `src/renderer/src/runtime.ts`. Under Tauri it maps the shared API onto typed `invoke` commands and event listeners. Under Electron 1.x it uses the preload bridge.

The renderer cannot access the filesystem, shell, clipboard, registry, or arbitrary URLs directly. Rust commands validate input and return a `CommandResult` for recoverable failures. External URLs are restricted to the project GitHub prefix.

## Clipboard Flow

1. A background watcher samples the clipboard every 650 ms.
2. Enabled formats are normalized into text, image, or file snapshots.
3. A deterministic signature prevents recapturing unchanged data and items written by LightClip itself.
4. Foreground process exclusions and capture limits are evaluated before persistence.
5. The store deduplicates records, applies retention and item limits, compresses the snapshot, and broadcasts updated state.
6. The renderer sorts, searches, filters, and stages visible history records.

Image and file inspection is skipped while the corresponding opt-in setting is disabled. This avoids unnecessary conversion and PowerShell work in the default text-only path.

## Persistence

The default data root is `%APPDATA%\LightClip`. The primary file is compact JSON compressed with Brotli quality 11. Before replacement, the current primary file is copied to `.bak`; writes use a same-directory temporary file and a final rename. Unreadable primary data falls back to the backup and unrecoverable files are quarantined with a timestamped `.corrupt-*` suffix.

Store parsing normalizes settings, timestamps, IDs, item bounds, and file paths. Legacy text records without a `kind` field remain importable. Custom storage selection is persisted separately so the active store can be located on the next launch.

Tauri 2.0 reports local account encryption as unavailable. Electron 1.x encrypted stores must be exported from 1.x and imported into 2.0 as JSON.

## Windows Integration

- Startup uses the current-user `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` entry with `--hidden`.
- The frameless window hides on close and remains available through the tray and global shortcut.
- File-drop clipboard APIs and focus restoration use hidden, non-interactive Windows PowerShell processes.
- Paste-after-select captures the previous foreground window and focused control, hides LightClip, restores focus without resizing a normal window, and sends `Ctrl + V` asynchronously.

## Packaging

The NSIS installer uses WebView2's download bootstrapper, keeping WebView2 out of the installer payload. Official binaries are generated on GitHub-hosted Windows runners and attached to workflow runs; `v2.*` tags also publish GitHub Release assets.

The renderer build remains independently verifiable with `pnpm typecheck` and `pnpm build`. Rust and NSIS verification is performed by the GitHub workflow to avoid generating unsigned native executables on maintainer machines where heuristic antivirus products may interfere.
