# Privacy And Data Handling

LightClip is a local clipboard history tool. Clipboard managers can capture sensitive information, so privacy expectations must be explicit.

## Summary

- LightClip stores history locally on the user's machine.
- LightClip does not include cloud sync, telemetry, analytics, or crash upload behavior.
- Text capture is enabled by default.
- Image and file capture are disabled by default.
- File history stores file paths, not file contents.

## What Is Stored

Depending on settings, LightClip may store:

- Text copied to the clipboard.
- PNG data URLs for copied images or screenshots.
- Absolute file paths from copied files.
- Metadata such as timestamps, pin state, and copy counts.
- User settings such as global shortcut, startup preference, capture limits, and theme accent.

## Where Data Is Stored

Data is stored under `%APPDATA%\LightClip` for the current Windows user by default. The active storage directory can be changed in Settings.

Primary file:

```text
lightclip-store.json.br
```

You can open the data directory from Settings. Older readable plain Brotli and uncompressed stores are migrated automatically.

LightClip may also keep `lightclip-store.json.br.bak` and `.corrupt-*` recovery files in the active storage directory. These files can contain the same clipboard data as the primary store and should be treated as private.

Tauri 2.0 does not provide the Electron 1.x account-encryption option. Users with an encrypted 1.x store must export JSON from 1.x before upgrading and import that backup into 2.0. Exported JSON is unencrypted.

## What Is Not Stored

LightClip does not intentionally store:

- File contents for file history.
- Cloud account credentials.
- Remote sync tokens.
- Analytics identifiers.
- Clipboard data from configured excluded foreground apps.

## Network Behavior

The app does not need network access to run. Development and packaging tools may access the network when installing dependencies or publishing releases, but the packaged application does not include a sync backend.

When the user manually clicks update checking, LightClip requests the latest public GitHub Release metadata for this repository. Clipboard history is not sent with that request.

## Sensitive Clipboard Content

Clipboard history can include secrets if those secrets are copied while capture is enabled. Avoid capturing:

- Passwords.
- API keys and tokens.
- Private keys and certificates.
- Identity documents.
- Financial or medical records.
- Confidential screenshots.

## Deleting Data

You can delete individual history items, clear one non-pinned item type, clear unpinned history, set retention days, or delete the local store file while LightClip is not running.

Pinned items are intentionally preserved during bulk clear operations.

## Feature-Specific Notes

### Image History

Image history stores PNG data URLs. This can increase local database size quickly and can retain screenshots containing private information.

### File History

File history stores paths only. Paths can still reveal sensitive project names, customer names, usernames, or directory structures.

### Import And Export

History export writes clipboard records and settings to a user-selected JSON file. Exports are not encrypted by LightClip, so treat them as private local backups. Import validates supported record shapes before merging records into the local store.

### Startup

Startup registration is per current user and writes the installed executable to `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`. It does not require administrator permissions.
