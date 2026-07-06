# LightClip

LightClip is a lightweight Windows clipboard history app built with Electron, Vue 3, TypeScript, Vite, and pnpm. It stays in the tray, opens with `Alt + V`, and helps you search, pin, delete, and reuse copied content without sending clipboard data to a server.

> Current release: `v1.1.0`. This privacy release adds OS-backed local store encryption, foreground app exclusions, and optional paste-after-select behavior.

## Project Status

LightClip is stable for the local Windows clipboard-history workflow. Image and file history remain opt-in features that should be enabled only when you are comfortable storing that data locally.

## Features

- Text clipboard history with deduplication, search, type filters, pinning, preview, deletion, and bulk cleanup for unpinned items.
- Optional image history for screenshots and image clipboard payloads.
- Optional file history for file paths copied from Windows Explorer.
- Local-only Brotli-compressed persistence with a configurable storage directory; no sync service or telemetry is included.
- Automatic local backup recovery for the compressed store.
- Optional Windows account-backed encryption for the local store.
- Foreground app exclusions for password managers or other sensitive tools.
- Optional paste-after-select behavior for faster reuse.
- Tray-first behavior: closing the window hides it to the system tray.
- Startup registration for the current Windows user without administrator privileges.
- Global shortcut support, defaulting to `Alt + V`.
- Compact custom title bar with native window controls and no traditional menu bar.
- Theme accent switching: Mint, Blue, Violet, Rose, and Amber.
- Data management tools for JSON import/export, retention days, category cleanup, store size visibility, and storage location changes.

## Download

Download the latest build from [GitHub Releases](https://github.com/leaf-zly/lightclip/releases).

| Asset | Use case |
| --- | --- |
| `LightClip Setup x.y.z.exe` | Installer for day-to-day use. |
| `LightClip x.y.z.exe` | Portable build that can be run directly. |

## Requirements

- Windows 10 or Windows 11.
- PowerShell available on the system if you want file history to paste back as native Windows file drops.
- No network service is required after the app is installed.

## Quick Start

1. Install or run LightClip from a release asset.
2. Copy text as usual.
3. Press `Alt + V` to open LightClip.
4. Search or use `Up` / `Down` to select an item.
5. Press `Enter` or double-click an item to copy it back to the clipboard.

## Settings

Open the settings panel from the top-right toolbar.

| Setting | Default | Notes |
| --- | --- | --- |
| Startup | Off | Registers LightClip for the current Windows user. |
| Image history | Off | Stores PNG data URLs locally; can increase data size quickly. |
| File history | Off | Stores file paths, not file contents. |
| Local encryption | On when available | Uses Electron safeStorage backed by the current Windows account. |
| Excluded apps | Empty | Process names listed here are not captured when they are in the foreground. |
| Paste after copy | Off | Sends `Ctrl + V` after selecting a history item. |
| History limit | `300` | Applies to non-pinned records. |
| Global shortcut | `Alt + V` | Re-registers when changed. |
| Appearance | System | Supports system, light, and dark modes. |
| Theme accent | Mint | Changes chrome, focus, switch, and selected item accents. |
| Storage location | Electron `userData` | Stores `lightclip-store.json.br`; can be moved from settings. |

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Alt + V` | Show or hide LightClip. |
| `Up` / `Down` | Move selection. |
| `Enter` | Copy selected item. |
| `Esc` | Hide the window. |

## Privacy And Data

LightClip is designed as a local-first utility. Clipboard history is stored on the same machine and is not uploaded by the app.

Important boundaries:

- Text history is enabled by default.
- Image and file history are disabled by default because they can contain sensitive screenshots, design files, identity documents, or private file paths.
- File history stores paths only; it does not copy file contents into the LightClip database.
- Do not enable clipboard history while handling passwords, API tokens, private keys, personal identity numbers, or other secrets unless you understand the local storage risk.

See [Privacy And Data Handling](docs/PRIVACY.md) for the full policy.

## Data Location

LightClip stores data in the current user's Electron `userData` directory by default. You can open or change the active storage directory from Settings.

Primary data file:

```text
lightclip-store.json.br
```

The store uses Brotli compression at maximum quality. When Windows account-backed encryption is available and enabled, LightClip encrypts the compressed payload before writing it. Older `lightclip-store.json` files are read and migrated to the compressed store automatically. LightClip also keeps `lightclip-store.json.br.bak` as a local last-known-readable backup and restores from it if the primary store becomes unreadable.

Custom storage directory configuration remains in Electron `userData`:

```text
lightclip-storage.json
```

## Development

### Prerequisites

- Node.js 22+ or 24+.
- pnpm 11+.
- Windows 10/11 for full clipboard and packaging verification.

### Install

```powershell
pnpm install
```

### Run In Development

```powershell
pnpm dev
```

or:

```powershell
.\Start-LightClip.ps1
```

### Quality Checks

```powershell
pnpm typecheck
pnpm build
```

### Package Windows Builds

```powershell
pnpm dist
```

`electron-builder` is configured to use the local `node_modules/electron/dist` runtime and a fixed NSIS toolchain cache to reduce release-time dependency on GitHub-hosted binary downloads.

## Architecture

LightClip uses a small Electron split:

- `src/main`: Electron main process, tray integration, global shortcut, clipboard polling, persistence, and packaging-facing behavior.
- `src/preload`: narrow context bridge exposed to the renderer.
- `src/renderer`: Vue 3 interface for searching, filtering, preview, settings, history actions, and theme accents.
- `src/shared`: shared IPC and state types.

See [Architecture](docs/ARCHITECTURE.md) for more detail.

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

- Native file-paste restoration depends on the Windows PowerShell STA Clipboard API. If PowerShell is disabled by policy, LightClip falls back to copying file paths as text and HTML.
- Image history is stored as PNG data URLs and should be used with sensible history limits.
- Cloud sync is not implemented.
- The project does not yet include automated end-to-end tests.

## Security

Please do not report exploitable vulnerabilities in public issues. Read [SECURITY.md](SECURITY.md) before sharing details.

## License

LightClip is released under the [MIT License](LICENSE).
