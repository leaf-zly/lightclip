# Troubleshooting

This page lists common LightClip problems and the first checks to run before opening an issue.

## Window Is Blank

Try:

1. Install the latest release.
2. Close LightClip from the tray and start it again.
3. If developing locally, run:

```powershell
pnpm build
pnpm preview
```

Packaged builds rely on relative renderer assets. If the issue appears only in installer or portable builds, include the exact asset name in the bug report.

## Build Reports Garbled TypeScript

If `pnpm build` or `pnpm dist` reports syntax errors in `src/shared/types.ts` or `src/renderer/src/utils.ts` with unreadable characters, the source file is corrupted on disk. This is not caused by Windows PowerShell versus PowerShell 7.

Run:

```powershell
pnpm check:sources
git status --short
git restore src/shared/types.ts src/renderer/src/utils.ts
pnpm build
```

`pnpm build` and `pnpm dist` run the same source integrity check before TypeScript compilation, so corrupted source files should fail with a focused diagnostic before compiler parser errors appear.

## Dist Cannot Replace Win-Unpacked Files

If `pnpm dist` fails with `EBUSY` while removing files under `release\win-unpacked`, an older packaged LightClip process is still running from that directory.

Close LightClip from the tray, or run:

```powershell
Get-Process LightClip,electron -ErrorAction SilentlyContinue | Stop-Process -Force
pnpm dist
```

## Shortcut Does Not Open LightClip

Check:

- Another app may already own the shortcut.
- The configured shortcut may be invalid for Electron global shortcuts.
- Restart LightClip after changing the shortcut.

Include the configured shortcut in bug reports.

## Startup Does Not Work

Check:

- Startup is enabled in LightClip settings.
- Windows policies or endpoint security tools are not blocking login item registration.
- The installed app path still exists.

Startup registration is per current user and does not require administrator permissions.

## Electron Welcome Window Opens At Startup

If Windows opens an `Electron` window that says `To run a local app, execute...`, a development or preview startup entry is pointing to `node_modules\electron.exe` instead of `LightClip.exe`.

Run:

```powershell
reg query HKCU\Software\Microsoft\Windows\CurrentVersion\Run
reg delete HKCU\Software\Microsoft\Windows\CurrentVersion\Run /v electron.app.Electron /f
```

Current LightClip builds clean up this legacy entry on startup and only register startup from packaged builds.

## File History Does Not Paste Files In Explorer

LightClip uses Windows PowerShell with STA clipboard APIs to restore native file-drop clipboard payloads.

If this fails:

- Confirm file history is enabled.
- Confirm PowerShell is available and not blocked by policy.
- Confirm copied file paths still exist.

When native file-drop restoration fails, LightClip falls back to writing file paths as text and HTML.

## Image History Uses Too Much Space

Image history stores PNG data URLs. Reduce the history limit or disable image history if the local store grows too large.

## Data Reset

To reset local data:

1. Quit LightClip from the tray.
2. Open the Electron `userData` directory.
3. Delete `lightclip-store.json`.
4. Start LightClip again.

Do not share this file publicly because it may contain clipboard history.
