# LightClip v2.2.4

This maintenance release makes signed update checks more tolerant of slow or intermittent GitHub connections.

## Fixed

- Replaces the previous single three-second request with a six-second fast attempt and a twenty-second recovery attempt for interactive checks.
- Retries only transient network, DNS, connection, and timeout failures.
- Keeps signature, metadata, and permission failures fail-fast so update security errors remain visible.
- Improves updater error-text contrast in dark and system-dark themes.

## Improved

- Shows which update-check attempt is currently running.
- Promotes browser download as the primary recovery action when the signed endpoint remains unavailable.
- Uses one eight-second request for silent background checks without repeated background network traffic.

## Verification

- Seven updater utility tests cover retry recovery and non-retryable security failures.
- The dark updater error layout passes at 390x560 without horizontal overflow; all three recovery actions remain on one row.
- TypeScript and Vue type checking, renderer production build, and GitHub-hosted Windows native tests pass.

## Downloads

- LightClip_2.2.4_x64-setup.exe: recommended current-user installer.
- LightClip-portable-x64.exe: standalone application binary.

Updater artifacts are signed with the Tauri updater key. Windows executables are not Authenticode-signed, so SmartScreen or third-party antivirus products may still show an unknown-publisher warning.
