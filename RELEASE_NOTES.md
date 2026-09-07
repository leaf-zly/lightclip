# LightClip v2.3.1

This maintenance release improves panel responsiveness, clipboard reliability and interface consistency. Existing history and settings remain compatible.

## Responsiveness

- Keeps layout and theme changes responsive by moving settings persistence off the native UI thread and avoiding full-history broadcasts.
- Runs state loading and clipboard copying on blocking workers.
- Skips unchanged Windows clipboard image/file payloads and reduces retention-cleanup serialization.

## Interface And Updates

- Refines icon filters, tooltips, the title-bar mark, compact actions, scrollbars and dark-theme contrast.
- Adds compact record preview/actions and keeps keyboard selections visible.
- Uses one updater dialog from settings and the title bar, with focus containment and reliable installation busy state.
- Fixes stale update metadata, copy-link error feedback and accidental background copies from dialogs.

## Reliability

- Fixes temporary pause clearing, retained-history synchronization and invalid byte counts.
- Restores in-memory history and previous storage locations on persistence failures.
- Avoids deleting valid stored files before replacement.
- Reports paste-command submission honestly and provides failure feedback; target editor acceptance can vary.

## Verification And Limitations

The audited source passed 13 frontend tests, 20 Windows native tests, eight responsive light/dark browser cases using 936 synthetic records, and packaged Windows shortcut/caret-placement/textbox-paste smoke tests. Release packaging reruns the source CI gate and packaged smoke test before publication.

Browser updater tests use mocked installation. Real previous-version upgrade installation, diverse editors and multi-monitor/DPI combinations are not fully certified. Image thumbnail caching, full list virtualization, edit-before-copy, filtered export and Tauri data encryption remain open; see the [audit report](https://github.com/leaf-zly/lightclip/blob/v2.3.1/docs/AUDIT-2026-09-07.md).

## Downloads

- Use the Windows x64 `setup.exe` asset for installation, or check for updates inside LightClip.
- The portable executable is available separately.
- `latest.json` and `.sig` files are updater metadata, not installers. Updater signatures are not Windows Authenticode code signing; unsigned Windows binaries may still trigger antivirus or SmartScreen warnings.

[Download LightClip v2.3.1](https://github.com/leaf-zly/lightclip/releases/tag/v2.3.1)
