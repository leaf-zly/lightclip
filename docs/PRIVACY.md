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

Data is stored in Electron `userData` for the current Windows user by default. The active storage directory can be changed in Settings.

Primary file:

```text
lightclip-store.json.br
```

You can open the data directory from the tray menu or Settings. Older uncompressed stores are migrated automatically.

## What Is Not Stored

LightClip does not intentionally store:

- File contents for file history.
- Cloud account credentials.
- Remote sync tokens.
- Analytics identifiers.

## Network Behavior

The app does not need network access to run. Development and packaging tools may access the network when installing dependencies or publishing releases, but the packaged application does not include a sync backend.

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

Startup registration is per current user and uses Electron's login item settings. It does not require administrator permissions.
