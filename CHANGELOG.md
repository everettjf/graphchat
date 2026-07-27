# Changelog

All notable Graph Chat changes are documented here.

## 0.2.0 - 2026-07-27

### Added

- Large-graph collapse, focus, persisted layout, multi-selection, and graph-scoped undo.
- Cross-branch comparison and structured synthesis with traceable context snapshots.
- Knowledge metadata, explainable weighted search, study cards, and local graph metrics.
- Markdown, text, and text-based PDF import.
- Versioned JSON backup/restore and Obsidian-friendly Markdown export.
- Privacy-safe, local-only product-validation instrumentation and report export.
- Database schema versioning and an in-place v0.1.1 migration test.

### Changed

- Demo streaming throughput was raised to keep structured synthesis responsive.
- Release archives include the changelog, format specification, and acceptance guides.

### Privacy

- Product-validation exports exclude prompts, generated content, node titles, source URLs,
  API keys, OAuth credentials, and other source material.
