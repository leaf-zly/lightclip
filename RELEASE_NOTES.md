# LightClip v2.2.5

LightClip v2.2.5 focuses on fast panel interaction and reliable clipboard updates for large histories.

## Fixed

- Make standard and compact layout switching immediate instead of waiting for native persistence and a full state repaint.
- Avoid replacing the complete clipboard history snapshot when saving settings from the visible panel.
- Send newly captured clipboard records and copy-count changes as incremental updates.
- Prevent overlapping clipboard persistence tasks when clipboard changes arrive in quick succession.
- Capture the previous foreground target asynchronously while opening the panel, then wait for that capture only when paste-after-copy is requested.
- Improve paste-after-copy reliability when the helper process is still warming up.

## Verification

- `pnpm check:sources`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build:renderer`

## Downloads

The Windows installer and portable executable are published on the GitHub Release page.
