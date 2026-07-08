# LightClip v1.2.5

## Highlights

- Paste-after-copy now restores both the app window and the focused control captured before LightClip opens.
- This fixes cases where the selected history item was copied successfully, but `Ctrl + V` stayed on LightClip or another foreground window.
- The PowerShell helper now uses Windows input-thread attachment for focus restoration instead of relying on a plain foreground-window call.

## Download

- `LightClip Setup 1.2.5.exe`: installer for daily use.
- `LightClip 1.2.5.exe`: portable build that can run directly.

## Verification

- `pnpm typecheck`
- `pnpm build`
- `pnpm dist`
- Full source E2E with an isolated LightClip data directory, a real WinForms textbox target, real `Alt + V`, and verified pasted textbox content.
- Full packaged E2E against `release\win-unpacked\LightClip.exe` with the same target-input flow.

## Notes

- The app is not code signed yet, so Windows may show an unknown publisher warning.
- Image history and file history remain opt-in because clipboard data can be sensitive.
- Encrypted stores are bound to the current Windows account and may not decrypt under another account.
- Manual update checks contact GitHub Releases only when clicked.
- Exported JSON files contain clipboard history in plain text/data URLs, so keep exports private.
