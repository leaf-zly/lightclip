# LightClip v1.2.2

## Highlights

- Selecting a history item now hides the quick panel immediately.
- Clipboard writes and optional paste delivery happen before usage-count persistence.
- Usage counts still update in the background and broadcast state after the save completes.
- Manual copy operations now share the clipboard watcher signature format to avoid duplicate history records.

## Download

- `LightClip Setup 1.2.2.exe`: installer for daily use.
- `LightClip 1.2.2.exe`: portable build that can run directly.

## Verification

- `pnpm typecheck`
- `pnpm build`
- `pnpm dist`
- Packaged startup and compressed-store smoke check.

## Notes

- The app is not code signed yet, so Windows may show an unknown publisher warning.
- Image history and file history remain opt-in because clipboard data can be sensitive.
- Encrypted stores are bound to the current Windows account and may not decrypt under another account.
- Manual update checks contact GitHub Releases only when clicked.
- Exported JSON files contain clipboard history in plain text/data URLs, so keep exports private.
