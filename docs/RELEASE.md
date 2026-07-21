# Release Process

LightClip follows semantic versioning and uses GitHub Actions as the source of official Windows binaries.

## Release Requirements

1. Update versions in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
2. Update `CHANGELOG.md`, `RELEASE_NOTES.md`, and user-facing documentation.
3. Run the non-native local quality gates:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
```

4. Commit with a Conventional Commit prefix such as `feat:`, `fix:`, or `docs:`.
5. Push the release branch and wait for the `Tauri 2 Build` workflow to succeed.
6. Download and smoke test the workflow artifact before creating the release tag.

## Branch Build

Pushes to `codex/tauri-2.0` and manual dispatches compile on `windows-latest`. The workflow uploads the NSIS installer and standalone application binary as `lightclip-tauri-2-windows`.

```powershell
gh workflow run tauri-2-build.yml --ref codex/tauri-2.0
gh run list --workflow tauri-2-build.yml --limit 5
```

Do not commit generated binaries. Official artifacts must come from the public GitHub workflow so their source revision and build log remain auditable.

## Tagged Release

After the branch workflow and artifact smoke test pass, create and push an annotated `v2.*` tag:

```powershell
git tag -a v2.0.0 -m "LightClip v2.0.0"
git push origin v2.0.0
```

The tag run rebuilds from the tagged commit and publishes matching assets to GitHub Releases using `RELEASE_NOTES.md`. Do not upload a locally built replacement under the same release.

## Verification

Confirm the workflow conclusion, release tag, source commit, and expected assets:

```powershell
gh run list --workflow tauri-2-build.yml --limit 5
gh release view v2.0.0 --json name,tagName,url,assets,targetCommitish
git ls-remote --tags origin refs/tags/v2.0.0
```

The release notes must state that binaries are unsigned, identify installer versus standalone assets, describe migration requirements, and list completed verification.
