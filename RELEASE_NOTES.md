# LightClip v1.2.0

## Highlights

- Added staged history rendering for large history lists.
- Added lazy image decoding for image rows and previews.
- Added manual update checks against GitHub Releases.
- Added allowlisted release-page opening when an update is available.
- Added GitHub Actions CI and manual Windows release-build workflows.

## Download

- `LightClip Setup 1.2.0.exe`: installer for daily use.
- `LightClip 1.2.0.exe`: portable build that can run directly.

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
