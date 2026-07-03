# LightClip v0.1.4

## Highlights

- Added Brotli-compressed local storage with compact JSON and maximum compression quality.
- Added Settings controls to open, change, and reset the active storage directory.
- Added automatic migration from legacy `lightclip-store.json` to `lightclip-store.json.br`.
- Fixed legacy development startup entries that could open Electron's default welcome window.
- Expanded build-time source integrity checks for storage and main-process IPC files.

## Download

- `LightClip Setup 0.1.4.exe`: installer for daily use.
- `LightClip 0.1.4.exe`: portable build that can run directly.

## Verification

- `pnpm typecheck`
- `pnpm build`
- `pnpm dist`
- Packaged startup and compressed-store smoke check.

## Notes

- The app is not code signed yet, so Windows may show an unknown publisher warning.
- Image history and file history remain opt-in because clipboard data can be sensitive.
- Exported JSON files contain clipboard history in plain text/data URLs, so keep exports private.
