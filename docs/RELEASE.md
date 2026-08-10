# Release Process

LightClip follows semantic versioning and uses GitHub Actions as the source of official Windows binaries.

## Release Requirements

1. Update versions in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json`.
2. Update `CHANGELOG.md`, `RELEASE_NOTES.md`, and user-facing documentation.
3. Run the non-native local quality gates:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
cargo metadata --locked --no-deps --manifest-path src-tauri/Cargo.toml
```

4. Commit with a Conventional Commit prefix such as `feat:`, `fix:`, or `chore(release):`.
5. Push `main` and wait for both parallel CI jobs to succeed.
6. Optionally run the packaging workflow manually and smoke test its artifact.
7. Create the annotated release tag only after the source commit is green.

## Continuous Integration

Pull requests and `main` pushes do not package the application. The `CI` workflow runs frontend quality checks and native Windows tests as parallel jobs.

Native tests use Cargo's Release profile and share their Rust cache with the packaging workflow. This avoids compiling the Tauri dependency graph once for tests and again for packaging.

Failed Rust jobs also preserve their cache so a corrective push can reuse completed dependencies.

## Manual Package

Use a manual workflow dispatch when an installer is needed before a tagged release:

```powershell
gh workflow run tauri-2-build.yml --ref main
gh run list --workflow tauri-2-build.yml --limit 5
```

The workflow compiles on `windows-latest`, executes packaged Alt+V and focused-textbox paste verification, and uploads the NSIS installer and standalone binary as `lightclip-tauri-2-windows`.

Do not commit generated binaries. Official artifacts must come from the public GitHub workflow so their source revision and build log remain auditable.

## Tagged Release

After `main` CI and any optional manual package verification pass, create and push an annotated `v2.*` tag:

```powershell
git tag -a v2.2.2 -m "LightClip v2.2.2"
git push origin v2.2.2
```

Only manual dispatches and `v2.*` tags run the packaging workflow. A tag run publishes matching installer, portable executable, signature, and updater metadata to GitHub Releases using `RELEASE_NOTES.md`.

The packaging job waits for the same commit's complete `CI` workflow to pass, restores its shared Release cache, and then runs only packaging plus packaged-application smoke tests. Do not upload a locally built replacement under the same release.

## Verification

Confirm the workflow conclusion, release tag, source commit, and expected assets:

```powershell
gh run list --workflow tauri-2-build.yml --limit 5
gh release view v2.2.2 --json name,tagName,url,assets,targetCommitish
git ls-remote --tags origin refs/tags/v2.2.2
```

The release notes must state that binaries are unsigned, identify installer versus standalone assets, describe migration requirements, and list completed verification.