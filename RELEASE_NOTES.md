# LightClip v2.0.3

This patch makes paste-after-copy reliably return to the app and input control that was focused before LightClip opened.

## Fixed

- Removed the per-paste PowerShell process and its startup delay.
- Restores the captured top-level window and focused child control through direct Win32 calls.
- Waits for the LightClip panel to finish hiding and confirms the destination is foreground before sending `Ctrl+V`.
- Does not restore normal or maximized destination windows, preventing unwanted size changes and reducing flicker.

## Verification

- The packaged app is launched with `--hidden` on GitHub's Windows runner.
- The workflow focuses a real WinForms textbox, sends native `Alt+V`, selects a known history item, and requires that textbox to receive the item without manual refocusing.
- Rust host tests, source integrity, PowerShell 5/7 parsing, Vue/TypeScript, Tauri packaging, and dependency-lock checks remain enabled.

## Downloads

- `LightClip_*_setup.exe`: recommended current-user installer.
- `lightclip.exe`: standalone application binary.

Quit the existing LightClip tray process before replacing a standalone executable. Release binaries remain unsigned, so Windows SmartScreen or third-party antivirus products may show an unknown-publisher warning.
