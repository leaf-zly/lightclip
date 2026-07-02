# Governance

LightClip is currently maintained by the repository owner.

## Maintainer Responsibilities

Maintainers are responsible for:

- Reviewing issues and pull requests.
- Protecting user privacy and local clipboard data.
- Keeping release notes accurate.
- Publishing releases and release assets.
- Responding to security reports according to `SECURITY.md`.
- Enforcing the Code of Conduct.

## Decision Making

For small changes, maintainers may merge after review and passing validation.

For larger changes, maintainers should ask for an issue or design discussion first. Larger changes include:

- New clipboard payload types.
- Network, sync, telemetry, or cloud behavior.
- Persistence schema changes.
- Security-sensitive IPC changes.
- Packaging, installer, or startup behavior changes.
- Major UI workflow redesigns.

## Contribution Policy

External contributions are welcome once the repository has a formal license. Until a `LICENSE` file is added, broad external contributions should be treated carefully because licensing terms are not yet defined.

## Release Authority

Only maintainers should publish GitHub Releases, push release tags, or upload release artifacts.

Release steps are documented in `docs/RELEASE.md`.
