# Contributing To LightClip

Thank you for taking the time to improve LightClip. This guide explains how to work on the project in a way that keeps changes reviewable, testable, and aligned with the app's privacy-first direction.

## Before You Start

- Search existing issues and pull requests before opening new work.
- Open an issue first for large UI, storage, security, packaging, or clipboard behavior changes.
- Keep pull requests focused. A small complete change is easier to review than a broad mixed refactor.
- Do not submit code copied from incompatible licenses.

## Development Setup

Requirements:

- Windows 10/11 for full clipboard and packaging checks.
- Node.js 22+ or 24+.
- pnpm 11+.

Install dependencies:

```powershell
pnpm install
```

Run the app in development:

```powershell
pnpm dev
```

Package Windows builds:

```powershell
pnpm dist
```

## Quality Bar

Before opening a pull request, run:

```powershell
pnpm typecheck
pnpm build
```

Run `pnpm dist` when changing Electron main-process behavior, packaging config, icons, resource loading, startup behavior, or release-facing files.

## Coding Standards

- Prefer existing project patterns over introducing new frameworks or abstractions.
- Use TypeScript types for shared state, IPC contracts, settings, and persisted data.
- Keep Electron IPC narrow and typed through `src/shared/types.ts`.
- Keep renderer code in Vue 3 Composition API with `<script setup lang="ts">`.
- Add JSDoc for exported functions, classes, complex types, component contracts, and configuration objects.
- Add comments for non-obvious compatibility, privacy, or clipboard behavior. Avoid comments that restate code.
- Treat clipboard data as sensitive by default.
- Do not add telemetry, analytics, cloud sync, or network behavior without a dedicated design discussion.

## UI Guidelines

- Keep the app compact, fast to scan, and practical for repeated daily use.
- Prefer clear icon buttons with accessible labels and tooltips.
- Do not add marketing-style landing screens inside the app.
- Keep text fitting within controls at supported window sizes.
- Avoid visual changes that make sensitive clipboard content harder to read or clear.

## Privacy And Security Requirements

Clipboard managers handle high-risk data. Contributions must preserve these boundaries:

- Local data stays local unless a future feature explicitly documents otherwise.
- Image and file history remain opt-in.
- File history stores paths, not file contents.
- New persistence fields must have defaults and migration-safe normalization.
- Changes that expose data through logs, errors, release artifacts, or crash reports are not acceptable.

## Pull Request Checklist

- [ ] The change has a clear user-facing or maintenance purpose.
- [ ] Relevant docs are updated.
- [ ] New or changed public types/functions have JSDoc where appropriate.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm build` passes.
- [ ] `pnpm dist` was run when packaging or Electron runtime behavior changed.
- [ ] Screenshots or short recordings are attached for UI changes.
- [ ] Privacy/security impact is described for clipboard, storage, or IPC changes.

## Commit Style

Use [Conventional Commits](https://www.conventionalcommits.org/) for all commits:

```text
feat: add history export
fix: handle packaged renderer loading
docs: update release process
chore: bump release metadata
```

Common prefixes are `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `build`, and `ci`. Keep the subject concise and imperative after the prefix.

## License Notice

By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE) unless a separate written agreement says otherwise.
