# LightClip

LightClip is a lightweight, local-first clipboard history app for Windows. Version 2.0 uses Tauri 2, Vue 3, TypeScript, and the system WebView2 runtime, replacing the bundled Electron runtime used by LightClip 1.x.

Clipboard data stays on your machine. LightClip does not include telemetry, cloud sync, or a background network service. The only network request is a manual update check against GitHub Releases.

> Current version: `v2.0.3`. Windows packages are built by GitHub Actions and published through GitHub Releases.

## Features

- Text history with deduplication, search, filters, pinning, preview, deletion, and bulk cleanup.
- Optional image history with PNG preview and clipboard restoration.
- Optional file history with native Windows file-drop restoration and text fallback.
- Brotli-compressed local storage with a configurable data directory.
- Automatic backup recovery and unreadable-store quarantine.
- Per-app privacy exclusions for password managers and other sensitive tools.
- Optional paste-after-select behavior that returns input to the previous foreground window.
- Configurable history limits, retention, image size, and file-count limits.
- Import and export through portable JSON backups.
- System, light, and dark appearance modes with five full-app accent themes.
- Tray operation, current-user startup registration, and a configurable global shortcut.
- Manual update checks against GitHub Releases.

Image and file capture are disabled by default because those clipboard formats can contain sensitive or high-volume data.

## Download

Download LightClip only from [GitHub Releases](https://github.com/leaf-zly/lightclip/releases). Version 2 assets are generated on GitHub-hosted Windows runners.

| Asset | Purpose |
| --- | --- |
| `LightClip_*_setup.exe` | Recommended current-user NSIS installer. |
| `lightclip.exe` | Standalone application binary for advanced or portable use. |

LightClip is not currently code signed. Windows SmartScreen or third-party antivirus products may therefore show an unknown-publisher warning or a false positive. Publishing from GitHub makes every released binary traceable to a public commit and workflow, but it does not replace Authenticode signing.

## Requirements

- Windows 10 or Windows 11, 64-bit.
- Microsoft Edge WebView2 Runtime. The installer downloads the official bootstrapper when WebView2 is missing.
- Windows PowerShell 5.1 for native file-drop restoration and Windows focus integration.

## Quick Start

1. Install LightClip from GitHub Releases.
2. Copy text normally.
3. Press `Alt + V` to open the panel.
4. Search or use `Up` and `Down` to select an item.
5. Press `Enter` or double-click to copy it back.

Closing the panel hides it to the tray. Left-click the tray icon to reopen it; right-click for Open and Exit commands.

## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| Start with Windows | Off | Writes a current-user `HKCU` startup entry; no administrator access is required. |
| Image history | Off | Stores PNG data URLs and can grow the local store quickly. |
| File history | Off | Stores file paths only, never file contents. |
| Excluded apps | Empty | Skips capture while a listed process is in the foreground. |
| Paste after copy | Off | Restores the previous target and sends `Ctrl + V`. |
| History limit | `300` | Applies to non-pinned records. |
| Retention | Forever | Optional age-based cleanup for non-pinned records. |
| Global shortcut | `Alt + V` | Re-registers after the setting changes. |
| Appearance | System | Supports system, light, and dark modes. |
| Accent | Mint | Mint, Blue, Violet, Rose, or Amber across the full interface. |
| Storage location | `%APPDATA%\LightClip` | Can be moved from Settings. |

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Alt + V` | Show or hide LightClip. |
| `Up` / `Down` | Move selection. |
| `Enter` | Copy the selected item. |
| `Esc` | Hide the panel. |

## Data And Privacy

The active history file is:

```text
%APPDATA%\LightClip\lightclip-store.json.br
```

LightClip writes compact JSON through Brotli compression and keeps `lightclip-store.json.br.bak` as a last-known-readable backup. A custom directory pointer is stored in `%APPDATA%\LightClip\lightclip-storage.json`.

Version 2.0 does not expose the Electron 1.x account-encryption option. Before upgrading from an encrypted 1.x store, export history as JSON from LightClip 1.x, then import it into 2.0. Plain 1.x Brotli and legacy JSON stores are migrated automatically when readable.

Exports are plain JSON. Treat them as sensitive files. See [Privacy And Data Handling](docs/PRIVACY.md) for the complete data model and security boundaries.

## Development

### Prerequisites

- Node.js 24+
- pnpm 11+
- Rust stable with the MSVC target, only when compiling Tauri locally
- Windows 10/11 and WebView2 for runtime testing

### Install And Check

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
```

`pnpm build` performs source-integrity checks, TypeScript checks, and a renderer production build. It does not generate a Windows executable.

### Development Runtime

```powershell
pnpm tauri:dev
```

### Packaging

Official Windows packages are built by [Tauri 2 Build](.github/workflows/tauri-2-build.yml). Pushes to `codex/tauri-2.0` upload a workflow artifact; a `v2.*` tag also publishes the assets to GitHub Releases.

```powershell
gh workflow run tauri-2-build.yml --ref codex/tauri-2.0
```

`pnpm dist` remains available for trusted local Tauri packaging, but local native builds can attract heuristic antivirus scanning. Maintainers should use the GitHub workflow for official artifacts.

Legacy Electron source and `electron:*` scripts remain temporarily available for 1.x maintenance; they are not included in the 2.0 package.

## Architecture

- `src-tauri`: Tauri commands, clipboard polling, tray/startup integration, Windows paste integration, persistence, and packaging configuration.
- `src/renderer`: Vue 3 interface and the runtime bridge shared by Tauri 2 and legacy Electron 1.x.
- `src/shared`: renderer/runtime contracts.
- `src/main` and `src/preload`: legacy Electron 1.x implementation retained during migration.
- `.github/workflows/tauri-2-build.yml`: reproducible Windows packaging and tagged release publication.

See [Architecture](docs/ARCHITECTURE.md) for runtime boundaries and data flow.

## Documentation

- [Changelog](CHANGELOG.md)
- [Contributing Guide](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)
- [Support Policy](SUPPORT.md)
- [Code Of Conduct](CODE_OF_CONDUCT.md)
- [Release Process](docs/RELEASE.md)
- [Privacy And Data Handling](docs/PRIVACY.md)
- [Governance](docs/GOVERNANCE.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Roadmap](docs/ROADMAP.md)

## Known Limitations

- Release binaries are not Authenticode signed yet.
- Native file restoration and paste-after-select depend on Windows PowerShell and desktop focus restrictions.
- Encrypted Electron 1.x stores require a JSON export/import migration.
- Cloud sync is not implemented.
- Native Windows integration is compiled in GitHub Actions; this repository does not yet have automated desktop end-to-end coverage for Tauri.

## Security

Do not report exploitable vulnerabilities in public issues. Follow [SECURITY.md](SECURITY.md) for private reporting guidance.

## License

LightClip is released under the [MIT License](LICENSE).
