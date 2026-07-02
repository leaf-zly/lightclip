# Roadmap

This roadmap lists practical extensions that fit LightClip's lightweight clipboard-history direction.

## Near-Term

- Better image history UX:
  - larger preview on demand
  - copy image metadata
  - delete image-only history quickly
- Richer search:
  - filter by text, image, or file
  - pinned-only filter
  - fuzzy matching for long snippets
- Safer capture controls:
  - temporary pause timer
  - private-mode app exclusion list
  - clear history older than a chosen retention period
- Shortcut improvements:
  - validate shortcut conflicts more clearly
  - reset shortcut to default
  - optional paste-after-select behavior

## Mid-Term

- Data management:
  - export and import history
  - encrypted local store option
  - store size indicator and cleanup suggestions
- Preview improvements:
  - code/text formatting preservation
  - multi-line expanded preview
  - file path grouping and quick open location
- Reliability:
  - end-to-end UI smoke tests
  - packaged app startup tests
  - store migration tests

## Later

- App-aware capture labels when reliable source metadata is available.
- Optional OCR for image history, disabled by default.
- Optional local-only full-text index for large history sets.
- Plugin-style transforms such as trim, plain-text paste, or JSON formatting.

## Guardrails

- Keep image and file history opt-in.
- Keep cloud sync, telemetry, and network behavior out unless there is a dedicated design and privacy review.
- Prefer features that make daily clipboard recall faster without making the app feel heavy.
