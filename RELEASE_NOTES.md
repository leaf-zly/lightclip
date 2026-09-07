# LightClip v2.3.3

This maintenance release adds a larger, interactive image preview. Existing history and settings remain compatible.

## Responsiveness

- Moves pin/delete persistence off the Windows UI thread and avoids full-history broadcasts for these actions.
- Avoids cloning the complete image history when deleting one record.
- Removes expensive background blur from the history preview overlay.

## Interface

- Removes horizontal scrolling from history and preview surfaces.
- Truncates long record titles and file paths with ellipsis and full-text hover labels; text previews wrap long lines.
- Adds delayed image hover previews constrained to the window. Previews dismiss on scrolling, pointer exit, Escape and window blur.
- Adds pending-action feedback and duplicate-action protection to preview buttons.

## Reliability

- Restores pin state when saving fails.
- Keeps the preview and record available after failed deletion, with retry feedback.
- Keeps modal dismissal available while persistence is pending.

## Verification And Limitations

The source passed 13 frontend tests, 21 Windows native tests and eight responsive light/dark browser cases using 936 synthetic records. Browser checks cover delayed/failed actions, long unbroken text, long file paths and image-hover placement. Release packaging reruns the source CI gate and packaged shortcut/caret-placement/textbox-paste smoke test before publication.

Browser tests use mocked native responses. Performance with the user's actual history and real previous-version upgrade installation have not been measured in this release. Diverse editors and multi-monitor/DPI combinations are not fully certified. Image thumbnail caching, full list virtualization, edit-before-copy, filtered export and Tauri data encryption remain open; see the [audit report](https://github.com/leaf-zly/lightclip/blob/v2.3.2/docs/AUDIT-2026-09-07.md).

## Downloads

- Use the Windows x64 `setup.exe` asset for installation, or check for updates inside LightClip.
- The portable executable is available separately.
- `latest.json` and `.sig` files are updater metadata, not installers. Updater signatures are not Windows Authenticode code signing; unsigned Windows binaries may still trigger antivirus or SmartScreen warnings.

[Download LightClip v2.3.3](https://github.com/leaf-zly/lightclip/releases/tag/v2.3.3)
