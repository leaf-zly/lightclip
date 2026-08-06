# LightClip v2.1.2

This performance patch keeps large text, image, and file histories responsive during capture, shortcut activation, and item selection.

## Fixed

- Uses a fast Brotli persistence profile for routine clipboard writes instead of quality 11 recompression.
- Keeps Alt+V panel activation independent from history persistence and full-state serialization.
- Sends a single inserted or refreshed clipboard record to the renderer instead of retransmitting the complete history.
- Avoids deep Vue reactivity overhead for large immutable history snapshots.

## Storage Safety

- Existing history files remain fully compatible and no records are removed during migration.
- Writes still perform Brotli round-trip validation, preserve the previous backup, and atomically replace the active store.
- On the reported 937-item store, compressed size increases by approximately 11% in exchange for reducing compression from about 25.1 seconds to about 150 milliseconds.

## Verification

- Source integrity, TypeScript, renderer production build, Cargo lock, and large-payload Brotli round-trip coverage.
- GitHub-hosted Tauri compilation, NSIS packaging, native Alt+V startup, and real focused-textbox paste-after-copy testing.

## Downloads

- LightClip_*_setup.exe: recommended current-user installer.
- lightclip.exe: standalone application binary.

Quit the existing LightClip tray process before replacing a standalone executable. Release binaries remain unsigned, so Windows SmartScreen or third-party antivirus products may show an unknown-publisher warning.
