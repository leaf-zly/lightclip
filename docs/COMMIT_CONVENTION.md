# Commit Convention

LightClip uses Conventional Commits for maintainable release history.

## Format

```text
<type>: <short imperative summary>
```

Examples:

```text
feat: add history filters
fix: handle packaged renderer loading
docs: add MIT license
chore: bump release metadata
```

## Common Types

- `feat`: user-facing feature.
- `fix`: bug fix or reliability correction.
- `docs`: documentation-only change.
- `style`: formatting-only change with no behavior impact.
- `refactor`: code change that is neither a feature nor a bug fix.
- `test`: test additions or updates.
- `build`: packaging, dependency, or build-system change.
- `ci`: continuous-integration workflow change.
- `chore`: maintenance that does not fit another type.

## Guidance

- Keep the subject under 72 characters when practical.
- Use imperative mood after the prefix.
- Mention privacy, storage, or IPC implications in the commit body for sensitive changes.
- Do not rewrite already published release history without explicit maintainer approval.
