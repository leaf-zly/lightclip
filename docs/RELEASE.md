# Release Process

This document describes the expected release flow for LightClip maintainers.

## Versioning

Use semantic versioning:

- Patch: bug fixes, documentation, small polish.
- Minor: new user-facing features that remain compatible.
- Major: breaking changes after `1.0.0`.

Before `1.0.0`, breaking changes can happen in minor versions, but they should be documented clearly.

## Pre-Release Checklist

1. Confirm `main` is clean.
2. Update `package.json` version.
3. Update `CHANGELOG.md`.
4. Update `README.md` if install, usage, privacy, or support behavior changed.
5. Run quality checks:

```powershell
pnpm typecheck
pnpm build
```

6. Run package build:

```powershell
pnpm dist
```

7. Smoke test the packaged or production Electron app.

## Build Outputs

`pnpm dist` writes release assets to `release/`:

- `LightClip Setup x.y.z.exe`
- `LightClip Setup x.y.z.exe.blockmap`
- `LightClip x.y.z.exe`
- `latest.yml`

The `release/` directory is ignored by Git. Upload these files to GitHub Releases instead of committing them.

## GitHub Release

Create a tag matching the package version:

```powershell
gh release create v0.1.3 `
  "release/LightClip Setup 0.1.3.exe" `
  "release/LightClip Setup 0.1.3.exe.blockmap" `
  "release/LightClip 0.1.3.exe" `
  "release/latest.yml" `
  --title "LightClip v0.1.3" `
  --notes-file RELEASE_NOTES.md
```

Adjust the version in filenames and tag names for each release.

## Release Notes

Release notes should include:

- User-facing changes.
- Bug fixes.
- Privacy or security implications.
- Known limitations.
- Verification commands.
- Which artifact is installer vs portable.

## Post-Release Verification

After publishing:

```powershell
gh release view v0.1.3 --json name,tagName,url,assets
git ls-remote --tags origin refs/tags/v0.1.3
```

Confirm the release page contains all expected assets and that the tag points to the intended commit.
