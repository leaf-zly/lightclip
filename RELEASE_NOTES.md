# LightClip v2.3.4

This maintenance release improves automatic paste sequencing and removes full-history recompression from copy-count updates. Existing history and settings remain compatible.

## Automatic Paste

- Waits for selection keys to be released and the original input control to regain stable focus before submitting Ctrl+V.
- Removes cross-process input-queue attachment and forced control focus, which could cause stalls or interfere with modifier state.
- Rejects overlapping selections and stops pending paste when the target becomes invalid, focus is lost or the clipboard changes.
- Waits for the panel to finish hiding and preserves normal/maximized target-window bounds.
- Submits paste at most once; partial input delivery is not retried.

## Performance And Storage

- Saves copy counts and timestamps in `lightclip-usage.json` instead of recompressing all text and image history for every selection.
- The sidecar contains record IDs and usage metadata only, not copied text, images or file paths. Startup replays newer usage and full store saves fold it back into the main history file.
- Adds stage timing and failure diagnostics without logging clipboard contents.
- When backing up a live storage directory, include the sidecar to preserve the latest usage counts. Older versions ignore it, so downgrading may lose recent counters but not clipboard content.

## Verification And Limitations

The validated fix passed 15 frontend tests and 34 Windows native tests. Usage tests include 936 synthetic entries, unchanged compressed history after repeated selections, reload recovery and save-failure rollback.

A GitHub-built Windows package passed 12 consecutive pastes between two input controls, including held-Shift attempts and unchanged window bounds. Ordinary selection-to-insertion latency was 53-69 ms in that runner test; held-Shift cases completed in 183-196 ms including a deliberate 150 ms hold. Tagged packaging repeats the CI gate, packaged paste smoke and visible-installer handoff probe before publication.

These measurements are not a universal performance or compatibility guarantee. The user's real clipboard history, every editor, elevated applications and every multi-monitor/IME configuration have not been certified. Large-image decoding, file clipboard helpers and concurrent capture/import/maintenance writes can still add latency. Windows privilege boundaries remain unchanged. A submitted Ctrl+V is not proof that every editor accepted the content.

See [Automatic Paste Reliability](https://github.com/leaf-zly/lightclip/blob/v2.3.4/docs/PASTE-RELIABILITY.md) for the transaction and persistence contracts.

## Downloads

- Use the Windows x64 `setup.exe` asset for installation, or check for updates inside LightClip.
- The portable executable is available separately.
- `latest.json` and `.sig` files are updater metadata, not installers. Updater signatures are not Windows Authenticode code signing; unsigned Windows binaries may still trigger antivirus or SmartScreen warnings.

[Download LightClip v2.3.4](https://github.com/leaf-zly/lightclip/releases/tag/v2.3.4)
