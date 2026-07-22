# LightClip v2.1.0

This feature release expands local privacy, search, reusable snippets, and storage maintenance while keeping clipboard data on the device.

## Added

- Multi-term and quoted-phrase search with Today, 7-day, and 30-day filters.
- Reusable pinned snippets and Ctrl plus number selection for the first nine filtered results.
- Optional sensitive-content protection with built-in credential, verification-code, token, and payment-card detection plus custom keywords.
- Configurable storage budget, on-demand deduplication, and timestamped rolling backups.

## Safety

- Sensitive-content detection runs locally and is disabled by default to avoid surprising capture changes.
- Capacity cleanup never removes pinned snippets.
- Rolling backups remain local Brotli-compressed files and follow the configured storage directory.

## Verification

- Source integrity, TypeScript, and renderer production builds.
- Rust tests for sensitive detection, metadata migration, storage limits, native shortcut capture, and paste target parsing.
- GitHub-hosted Tauri compilation, NSIS packaging, native Alt+V startup, and real focused-textbox paste-after-copy testing.

## Downloads

- LightClip_*_setup.exe: recommended current-user installer.
- lightclip.exe: standalone application binary.

Quit the existing LightClip tray process before replacing a standalone executable. Release binaries remain unsigned, so Windows SmartScreen or third-party antivirus products may show an unknown-publisher warning.
