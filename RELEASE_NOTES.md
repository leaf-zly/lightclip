# LightClip v1.2.1

## Highlights

- Theme accent and appearance changes now apply immediately in the renderer.
- Persistence still happens in the background, so encrypted/compressed stores no longer make the UI feel stuck when switching colors.

## Download

- `LightClip Setup 1.2.1.exe`: installer for daily use.
- `LightClip 1.2.1.exe`: portable build that can run directly.

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
