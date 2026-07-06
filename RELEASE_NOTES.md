# LightClip v1.1.0

## Highlights

- Added Windows account-backed local store encryption through Electron safeStorage.
- Migrates plain Brotli stores to encrypted Brotli stores when encryption is enabled and available.
- Added foreground app exclusions for password managers or other sensitive tools.
- Added optional paste-after-select behavior for selecting an item and sending `Ctrl + V`.
- Added Settings controls for local encryption, excluded apps, and paste-after-select.

## Download

- `LightClip Setup 1.1.0.exe`: installer for daily use.
- `LightClip 1.1.0.exe`: portable build that can run directly.

## Verification

- `pnpm typecheck`
- `pnpm build`
- `pnpm dist`
- Packaged startup and compressed-store smoke check.

## Notes

- The app is not code signed yet, so Windows may show an unknown publisher warning.
- Image history and file history remain opt-in because clipboard data can be sensitive.
- Encrypted stores are bound to the current Windows account and may not decrypt under another account.
- Exported JSON files contain clipboard history in plain text/data URLs, so keep exports private.
