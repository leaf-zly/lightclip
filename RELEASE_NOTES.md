# LightClip v1.2.3

## Highlights

- Paste-after-copy now uses a warm lightweight Windows Script Host helper instead of launching PowerShell for every paste.
- Automatic paste delivery is asynchronous, so it no longer blocks the Electron main process.
- The helper starts only when paste-after-copy is enabled and is stopped when the setting is disabled or the app exits.
- The quick panel still hides immediately after selecting a history item.

## Download

- `LightClip Setup 1.2.3.exe`: installer for daily use.
- `LightClip 1.2.3.exe`: portable build that can run directly.

## Verification

- `pnpm typecheck`
- `pnpm build`
- `pnpm dist`
- Packaged startup and compressed-store smoke check.
- Paste helper quit smoke check.

## Notes

- The app is not code signed yet, so Windows may show an unknown publisher warning.
- Image history and file history remain opt-in because clipboard data can be sensitive.
- Encrypted stores are bound to the current Windows account and may not decrypt under another account.
- Manual update checks contact GitHub Releases only when clicked.
- Exported JSON files contain clipboard history in plain text/data URLs, so keep exports private.
