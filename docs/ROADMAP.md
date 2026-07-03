# Roadmap

This roadmap lists practical extensions that fit LightClip's lightweight clipboard-history direction.

## Completed In v1.0.0

- Larger preview on demand for text, image, and file history.
- Filters for text, image, file, pinned, and all records.
- Category cleanup for non-pinned records.
- Retention days for old non-pinned records.
- JSON import/export and store size visibility.
- Temporary capture pause and shortcut reset controls.
- Theme accent and light/dark appearance controls.
- Brotli-compressed storage with configurable storage location.

## Near-Term

- Richer search:
  - fuzzy matching for long snippets
  - saved filter presets
- Safer capture controls:
  - private-mode app exclusion list
  - one-click sensitive-content pause presets
- Shortcut improvements:
  - validate shortcut conflicts more clearly
  - optional paste-after-select behavior

## Mid-Term

- Data management:
  - encrypted local store option
  - cleanup suggestions for large image history
- Preview improvements:
  - code/text formatting preservation
  - multi-line expanded preview refinements
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
