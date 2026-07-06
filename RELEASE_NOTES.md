# LightClip v1.2.4

## Highlights

- Paste-after-copy now captures the foreground window before the LightClip panel opens.
- The captured window is reactivated before `Ctrl + V` is sent, so automatic paste targets the app you were using.
- The warm helper now uses Win32 APIs for capture, restore, and paste delivery through a single stdin command loop.
- The quick panel still hides immediately after selecting a history item, and paste delivery remains asynchronous.

## Download

- `LightClip Setup 1.2.4.exe`: installer for daily use.
- `LightClip 1.2.4.exe`: portable build that can run directly.

## Verification

- `pnpm typecheck`
- `pnpm build`
- `pnpm dist`
- Packaged startup and compressed-store smoke check.
- Paste helper capture/quit smoke check.

## Notes

- The app is not code signed yet, so Windows may show an unknown publisher warning.
- Image history and file history remain opt-in because clipboard data can be sensitive.
- Encrypted stores are bound to the current Windows account and may not decrypt under another account.
- Manual update checks contact GitHub Releases only when clicked.
- Exported JSON files contain clipboard history in plain text/data URLs, so keep exports private.
