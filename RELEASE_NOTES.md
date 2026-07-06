# LightClip v1.0.1

## Highlights

- Added `lightclip-store.json.br.bak` as a last-known-readable local backup.
- Added startup recovery from backup when the primary compressed store is missing or unreadable.
- Quarantines unreadable store files with `.corrupt-*` suffixes before recreating a clean store.
- Prevents invalid or occupied global shortcuts from being saved.
- Refreshes settings after failed saves so the UI reflects the actual persisted state.

## Download

- `LightClip Setup 1.0.1.exe`: installer for daily use.
- `LightClip 1.0.1.exe`: portable build that can run directly.

## Verification

- `pnpm typecheck`
- `pnpm build`
- `pnpm dist`
- Packaged startup and compressed-store smoke check.

## Notes

- The app is not code signed yet, so Windows may show an unknown publisher warning.
- Image history and file history remain opt-in because clipboard data can be sensitive.
- Exported JSON files contain clipboard history in plain text/data URLs, so keep exports private.
