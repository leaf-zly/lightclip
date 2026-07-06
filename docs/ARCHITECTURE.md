# Architecture

LightClip is a small Electron desktop app with a local-first data model and a narrow IPC boundary.

## Goals

- Keep clipboard history searchable and fast.
- Keep data local by default.
- Keep the renderer unprivileged and communicate through typed IPC.
- Keep packaging reliable for Windows installer and portable builds.

## Process Layout

| Area | Path | Responsibility |
| --- | --- | --- |
| Main process | `src/main` | App lifecycle, tray, global shortcut, clipboard polling, persistence, startup registration, native file clipboard fallback. |
| Preload | `src/preload` | Context bridge exposing the minimal `window.lightClip` API. |
| Renderer | `src/renderer` | Vue 3 UI, search, settings, history interaction, theme accent presentation. |
| Shared types | `src/shared` | IPC channel names, state, settings, command result, and clipboard item contracts. |
| Resources | `resources` | App icons used by Electron, tray, installer, and renderer. |

## State Model

The main process owns persisted state through `ClipboardStore`.

Primary state:

- `settings`: user preferences and capture limits.
- `items`: clipboard history records sorted for display.
- `storageBytes`: current compressed on-disk store size for lightweight storage visibility.
- `storageDirectory` / `storageFilePath`: active data location shown in Settings.

Clipboard item kinds:

- `text`: normalized text.
- `image`: PNG data URL with dimensions and byte size.
- `file`: absolute file path list.

## Persistence

Data is written to `lightclip-store.json.br` in Electron `userData` by default. The store uses compact JSON plus Brotli compression at maximum quality to reduce disk usage, especially when image history is enabled.

Older `lightclip-store.json` files are still readable and are migrated to the compressed store on load. A custom storage directory is persisted separately in `lightclip-storage.json` under Electron `userData`, allowing the data file to move without losing the pointer to it.

When `encryptStore` is enabled and Electron safeStorage is available, the Brotli payload is encrypted with OS account-backed storage before being written. The file path remains stable so old plain Brotli stores can be read and rewritten in encrypted form during normal saves.

Before replacing the primary compressed store, LightClip copies the last readable store to `lightclip-store.json.br.bak`. On startup, the backup is used when the primary file is missing or unreadable. When both primary and backup stores are unreadable, they are quarantined with `.corrupt-*` suffixes and a clean store is recreated.

The store normalizes settings and history records on load, update, and import so old stores receive new defaults safely. This is required for settings such as `themeAccent`, `themeMode`, `capturePausedUntil`, and `retentionDays` that were added after the initial release.

## Clipboard Capture

The main process polls the clipboard at a short interval and creates a stable signature from enabled payloads:

- Text is always read.
- File paths are read only when file history is enabled.
- Images are read only when image history is enabled.
- Foreground app exclusions are checked before a changed clipboard payload is recorded.

Capture order prefers richer enabled payloads:

1. Files when file history is enabled and file paths exist.
2. Image when image history is enabled and an image exists.
3. Text otherwise.

## IPC Boundary

The renderer never imports Electron directly. It calls the preload bridge:

- read state
- copy/delete/toggle pin/clear history
- update settings
- control window visibility
- quit the app
- subscribe to state changes

New privileged behavior should be added to `src/shared/types.ts`, implemented in `src/main/index.ts`, and exposed deliberately in `src/preload/index.ts`.

## UI Theming

Theme accents are persisted as `AppThemeAccent` values. Appearance mode is persisted as `AppThemeMode` with `system`, `light`, and `dark` options. The renderer maps these settings to `theme-*` and `mode-*` classes on the shell, and CSS variables drive:

- title bar chrome
- focus rings
- selected history item states
- switches
- toast and empty states
- image preview surfaces

## Packaging

Vite builds the renderer to `dist/renderer` with `base: './'` so packaged `file://` loading works. TypeScript builds the main and preload code into `dist/main` and `dist/preload`.

`electron-builder` creates:

- NSIS installer
- portable executable

The project uses the local Electron runtime from `node_modules/electron/dist` to reduce external download failures during packaging.
