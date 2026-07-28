# Changelog

All notable Graph Chat changes are documented here.

## 0.2.2 - 2026-07-28

### Added

- Added persistent language switching across the application and documentation site for
  English, Simplified Chinese, Spanish, French, German, Japanese, Korean, and Traditional Chinese.
- Added locale-aware model responses for every supported interface language.
- Added a top-bar model indicator that opens model and provider settings directly.

### Changed

- Replaced the two-button language control with a compact, accessible language selector.
- Improved locale-aware relative times and Traditional Chinese behavior throughout the workspace.

## 0.2.1 - 2026-07-28

### Fixed

- Made summary navigation return to the structural parent and hid the control on root nodes.
- Restored readable Markdown tables with borders, spacing, zebra rows, and horizontal scrolling.
- Made the synthesis-reference toggle expose clear labels and selected-state feedback.

### Changed

- Made the packaged `graphchat` command run on Node.js 22.19+ while retaining Bun support.
- Added npm installation instructions and npm publishing to the tagged-release workflow.

## 0.2.0 - 2026-07-28

### Added

- Large-graph collapse, focus, persisted layout, multi-selection, and graph-scoped undo.
- Cross-branch comparison and structured synthesis with traceable context snapshots.
- Knowledge metadata, explainable weighted search, study cards, and local graph metrics.
- Markdown, text, and text-based PDF import.
- Versioned JSON backup/restore and Obsidian-friendly Markdown export.
- Privacy-safe, local-only product-validation instrumentation and report export.
- Database schema versioning and an in-place v0.1.1 migration test.
- SQLite FTS5 retrieval with automatically synchronized indexes and Chinese substring fallback.
- Archived-thread management with confirmed individual and bulk permanent deletion.
- Realistic learning-data seeding for long-graph product testing.

### Changed

- Demo streaming throughput was raised to keep structured synthesis responsive.
- Release archives include the changelog, format specification, and acceptance guides.
- Graph layout now persists atomically and rolls back in the interface when saving fails.
- New graph, archive, layout, and relationship controls are fully localized in English and Chinese.
- Database migrations and archived-thread UI are split into dedicated modules.
- Production dependencies were upgraded and the unified verification command now checks
  lockfiles, known vulnerabilities, types, tests, builds, the documentation site, and E2E flows.

### Privacy

- Product-validation exports exclude prompts, generated content, node titles, source URLs,
  API keys, OAuth credentials, and other source material.
