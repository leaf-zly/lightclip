# LightClip v1.0.0

## Highlights

- First stable LightClip release.
- Includes searchable text clipboard history, filters, pinning, preview, cleanup, import/export, and opt-in image/file history.
- Includes theme accent switching, system/light/dark appearance, startup registration, and tray-first behavior.
- Uses Brotli-compressed local storage with configurable storage location.
- Migrates legacy `lightclip-store.json` stores to `lightclip-store.json.br` automatically.
- Cleans legacy development startup entries that could open Electron's default welcome window.

## Download

- `LightClip Setup 1.0.0.exe`: installer for daily use.
- `LightClip 1.0.0.exe`: portable build that can run directly.

## Verification

- `pnpm typecheck`
- `pnpm build`
- `pnpm dist`
- Packaged startup and compressed-store smoke check.

## Notes

- The app is not code signed yet, so Windows may show an unknown publisher warning.
- Image history and file history remain opt-in because clipboard data can be sensitive.
- Exported JSON files contain clipboard history in plain text/data URLs, so keep exports private.
