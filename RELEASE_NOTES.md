# LightClip v0.1.3

## Highlights

- Added history filters for all, text, image, file, and pinned records.
- Added large preview for text, image, and file history items.
- Added JSON import/export for local history backups.
- Added retention-day cleanup, store size visibility, category cleanup, and shortcut reset controls.
- Added temporary capture pause from the top toolbar.
- Added the MIT License.

## Download

- `LightClip Setup 0.1.3.exe`: installer for daily use.
- `LightClip 0.1.3.exe`: portable build that can run directly.

## Verification

- `pnpm typecheck`
- `pnpm build`
- `pnpm dist`
- Production Electron startup smoke check.

## Notes

- The app is not code signed yet, so Windows may show an unknown publisher warning.
- Image history and file history remain opt-in because clipboard data can be sensitive.
- Exported JSON files contain clipboard history in plain text/data URLs, so keep exports private.
