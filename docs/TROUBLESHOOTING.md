# Troubleshooting

This page lists common LightClip problems and the first checks to run before opening an issue.

## Window Is Blank

Try:

1. Install the latest release.
2. Close LightClip from the tray and start it again.
3. If developing locally, run:

```powershell
pnpm build
```

Packaged builds rely on relative renderer assets and the Windows WebView2 runtime. Repair or install WebView2 if the GitHub release remains blank, and include the exact release asset name in the bug report.

## Build Reports Garbled TypeScript

If `pnpm build` or `pnpm dist` reports syntax errors in `src/shared/types.ts` or `src/renderer/src/utils.ts` with unreadable characters, the source file is corrupted on disk. This is not caused by Windows PowerShell versus PowerShell 7.

Run:

```powershell
pnpm check:sources
git status --short
git restore src/shared/types.ts src/renderer/src/utils.ts
pnpm build
```

`pnpm build` runs the source integrity check before TypeScript compilation. Official `pnpm dist` packaging runs in GitHub Actions after the same quality gate.

## GitHub Packaging Fails

Open the failed `Tauri 2 Build` run and inspect the first failing step. Dependency installation, source checks, Rust compilation, and NSIS packaging are separate steps so failures remain attributable.

Do not upload a locally built binary as an official replacement. Fix the source or workflow and rerun:

```powershell
gh workflow run tauri-2-build.yml --ref codex/tauri-2.0
```

## Shortcut Does Not Open LightClip

Check:

- Another app may already own the shortcut.
- The configured shortcut may be invalid or already reserved by Windows.
- Restart LightClip after changing the shortcut.

Include the configured shortcut in bug reports.

## Encrypted 1.x Storage Cannot Be Opened

Tauri 2.0 cannot directly decrypt Electron 1.x account-encrypted stores. Start LightClip 1.x under the Windows account that created the store, export history to JSON, then import that file into LightClip 2. Keep the JSON backup private because it is not encrypted.

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

Delete the legacy entry, start LightClip 2, and enable startup again in Settings. LightClip 2 registers only its packaged executable with `--hidden`.

## File History Does Not Paste Files In Explorer

LightClip uses Windows PowerShell with STA clipboard APIs to restore native file-drop clipboard payloads.

If this fails:

- Confirm file history is enabled.
- Confirm PowerShell is available and not blocked by policy.
- Confirm copied file paths still exist.

When native file-drop restoration fails, LightClip falls back to writing file paths as text.

## Image History Uses Too Much Space

Image history stores PNG data URLs. Reduce the history limit or disable image history if the local store grows too large.

## Data Reset

To reset local data:

1. Quit LightClip from the tray.
2. Open the active storage directory from Settings or the tray menu.
3. Delete `lightclip-store.json.br`, `lightclip-store.json.br.bak`, and any `lightclip-store.json.br.corrupt-*` files.
4. To also forget a custom storage directory, delete `%APPDATA%\LightClip\lightclip-storage.json`.
5. Start LightClip again.

Do not share these files publicly because they may contain clipboard history or local paths.
