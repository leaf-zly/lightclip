# LightClip v0.1.2

## Highlights

- Unified the title bar and main content colors so the app chrome feels like one product surface.
- Added theme accent switching in settings: Mint, Blue, Violet, Rose, Amber.
- Removed the traditional `File / Edit / View / Window` menu bar from the app UI.
- Preserved the packaged-app blank window fix from `v0.1.1`.

## Download

- `LightClip Setup 0.1.2.exe`: installer for daily use.
- `LightClip 0.1.2.exe`: portable build that can run directly.

## Verification

- `pnpm typecheck`
- `pnpm build`
- `pnpm dist`
- Production Electron startup smoke check.

## Notes

- The app is not code signed yet, so Windows may show an unknown publisher warning.
- Image history and file history remain opt-in because clipboard data can be sensitive.
