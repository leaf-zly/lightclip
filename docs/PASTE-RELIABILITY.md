# Automatic Paste Reliability

## Transaction Contract

History selection writes the clipboard and submits at most one Ctrl+V to the
captured foreground application. A successful submission does not prove that an
editor accepted the paste. Windows integrity-level restrictions still apply;
LightClip does not elevate itself or bypass protected applications.

The native worker rejects overlapping selections, waits for panel hiding and
selection-key release, and verifies stable focus in the captured input control.
It does not attach input queues or call cross-process `SetFocus`. Normal and
maximized window bounds are preserved. Changed clipboard contents, invalid
targets, held keys and lost focus stop delivery without retrying the V key.

Release waiting is limited to approximately 512 ms, focus waiting to 256 ms,
and panel-hide polling to 256 ms, excluding native API execution and scheduling.
These are polling budgets, not an end-to-end latency guarantee. Initial store
lookup can still contend with capture/import/maintenance writes, and large image
decoding or file clipboard helpers can still take longer.

## Usage Persistence

`lightclip-usage.json` in the selected storage directory stores record IDs,
creation/update times and copy counts only. It contains no copied text, image
data or file paths. Selecting history atomically rewrites this small sidecar
instead of recompressing the entire clipboard store.

Startup replays newer metadata for matching record identities. Any full history
save includes the current counters and removes the sidecar only after its own
atomic write succeeds. Failed usage writes roll back the in-memory counter,
without undoing the already completed clipboard copy. Corrupt usage metadata
does not invalidate clipboard history. Old app versions ignore this sidecar;
downgrading may lose only recent usage counts. For an exact live backup, include
both the main store and sidecar; existing scheduled full-store backups may omit
the most recent usage counts.

## Diagnostics And Verification

The native log records `lookup_ms`, `clipboard_ms`, `delivery_ms`, `total_ms`
and failure stages. It does not record clipboard payloads or target titles.

- Deterministic sequencing tests cover held keys, delayed/lost focus, clipboard
  replacement, timeouts and rejected input with no duplicate retry.
- Storage tests use 936 synthetic entries and verify that repeated usage writes
  leave the compressed history unchanged, survive reload and roll back on error.
- The packaged Windows smoke test alternates two textboxes over 12 selections,
  holds Shift through selected attempts, and checks insertion and window bounds.
  It is restricted to disposable GitHub Actions runners because it replaces the
  runner's clipboard-store fixture.

The textbox smoke is not certification of every editor, administrator window,
IME, multi-monitor configuration or antivirus environment. Real-world failures
must be classified from stage timings before changing delays or focus logic.
