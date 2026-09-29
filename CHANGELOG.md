# Changelog

All notable Pi Graph Chat changes are documented here.

## 0.3.0 - Unreleased

Pi Graph Chat is now a personal tool built on the Pi agent ecosystem. This
release renames the project from Graph Chat, drops product and release
overhead, and adds a read-only bridge to Pi coding-agent sessions.

### Added

- Added the `graphchat-pi` Pi package (`packages/graphchat-pi`): graph tools,
  `/graph` and `/ref` commands, four learning skills, and two prompt templates
  for the terminal `pi`. Graph runs in the web app now load the user's own Pi
  extensions, skills, prompt templates, and packages.
- Graphs can be rooted in a project directory. Their Pi session lives in that
  project, and answers get Pi's read-only `read`, `grep`, `find`, and `ls`
  tools plus the project's `AGENTS.md`.
- Added cross-session references: nodes marked as references follow the user
  into another graph or a new thread, and a turn from any terminal Pi session
  can be added as a reference from the Pi session view.
- Added `/api/search`, `/api/graphs/:id/search`, `GET /api/nodes/:id`, and
  `/api/graphs/by-session/:sessionId`, plus `?graph=` and `?pi=` deep links.
- Every knowledge graph is now backed by a Pi session file. Answers run
  through `pi-coding-agent`'s `createAgentSession()`; a new answer branches
  the session at the parent node's entry, existing nodes are replayed into
  the session on first use, and references plus selected text are injected
  as a `custom_message` entry instead of being pasted into the prompt. The
  graph topbar can copy a `pi --session` command to continue the graph in
  the terminal.
- Added a read-only Pi session view: every session under Pi's session
  directory is listed in the sidebar and rendered as a tree of turns with
  abandoned branches, tool calls, thinking, labels, and the current position.
  The view refreshes automatically and can copy a `pi --session` command to
  continue the session in the terminal.
- Added Anthropic and Google Gemini providers through Pi's `pi-ai` catalog.
- Added light and dark themes with a system-preference default, a persistent
  top-right toggle, and a no-flash bootstrap script.

### Changed

- Credentials moved to Pi's own agent directory through `ModelRuntime`:
  ChatGPT sign-in from the settings dialog and `pi /login` now share one
  `auth.json`. The app-owned `.graphchat/auth.json` and the Codex CLI
  credential import were removed.
- Database schema version 6 adds `graphs.pi_session_path`,
  `nodes.pi_entry_id`, and `graphs.project_dir`.
- Renamed the project and package to `pi-graph-chat`; the launcher is now
  `bun run launch` / `pi-graph-chat`.
- Upgraded `@earendil-works/pi-ai` and `pi-agent-core` to 0.87.1 and added
  `@earendil-works/pi-coding-agent` for session parsing.
- ChatGPT sign-in status is read without triggering a token refresh.
- The default ChatGPT model is `gpt-5.5`.
- Interface languages are reduced to English and Simplified Chinese.
- Local graph metrics count recent node activity instead of product events.
- Redesigned the workspace with a neutral, token-driven design system:
  Inter Variable typography, refined radii and shadows, and restyled graph
  canvas, nodes, minimap, and Markdown in both themes.

### Removed

- Removed product-validation instrumentation, the `graph_events` table, and
  the validation report endpoint.
- Removed npm publishing, standalone binaries, the GitHub Pages site, release
  validation scripts, and the npm lockfile. Bun is the only supported
  development toolchain.

### Fixed

- Fixed the composer overlapping the inspector footer action bar.

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
