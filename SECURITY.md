# Security Policy

LightClip is a clipboard history app. Security reports are especially important because the app can store sensitive local clipboard data.

## Supported Versions

Only the latest published release is supported for security fixes.

| Version | Supported |
| --- | --- |
| `0.1.x` latest | Yes |
| Older `0.1.x` releases | Best effort |

## Reporting A Vulnerability

Please do not open public issues for vulnerabilities.

Use one of these options instead:

- Open a private GitHub security advisory if repository permissions allow it.
- Contact the repository owner through their GitHub profile if private advisories are unavailable.

Include:

- Affected version or commit.
- Operating system and Windows version.
- Clear reproduction steps.
- Expected and actual behavior.
- Impact assessment, especially whether clipboard data can be read, written, leaked, corrupted, or persisted unexpectedly.
- Any proof-of-concept code or screenshots that do not expose real secrets.

## Response Expectations

The maintainer should aim to:

- Acknowledge valid reports within 7 days.
- Provide an initial triage outcome when enough information is available.
- Keep reporter details private unless disclosure is explicitly approved.
- Publish fixes and release notes without exposing unnecessary exploitation details.

## Security Boundaries

Expected behavior:

- Clipboard data is stored locally under Electron `userData`.
- Image and file history are opt-in.
- File history stores paths, not file contents.
- The renderer accesses privileged behavior only through the preload bridge.

Out of scope unless a real exploit is demonstrated:

- Users intentionally enabling sensitive clipboard history.
- Local users with full filesystem access reading the current user's app data.
- Windows SmartScreen or unsigned executable warnings.
- Denial of service from extremely large clipboard contents that exceed documented settings.
