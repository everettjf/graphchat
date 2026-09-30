# Changelog

All notable Pi Graph Chat changes are documented here.

## 0.3.0 - Unreleased

Pi Graph Chat is now a personal tool built on the Pi agent ecosystem. This
release renames the project from Graph Chat, drops product and release
overhead, and adds a read-only bridge to Pi coding-agent sessions.

### Added

- The Pi session list no longer shows the sessions the app created for its own
  graphs, and permanently deleting an archived graph removes its session file.
  Terminal sessions bound with `/graph use` are still listed and never deleted.
- Added the `pi-graph-chat-extension` Pi package (`packages/pi-extension`): graph tools,
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
- Nodes record the tools their answer ran: name, arguments, a result summary,
  and whether the call failed. The node card shows the count, the inspector
  lists each call, and calls appear while the answer is still streaming.
  Turns imported from the terminal carry their tool calls too.
- Added DeepSeek as a provider (`DEEPSEEK_API_KEY` or an in-process key).

### Changed

- **Breaking:** every `graphchat` identifier is now `pi-graph-chat`, with no
  fallback to the old names. Environment variables are `PI_GRAPH_CHAT_*`, the
  default data directory is `.pi-graph-chat`, the Pi package is
  `pi-graph-chat-extension` in `packages/pi-extension`, and browser storage
  keys, session file names, and the demo model id changed with them. To keep
  existing data, rename `.graphchat` to `.pi-graph-chat` and the
  `graphchat.sqlite` files inside it to `pi-graph-chat.sqlite`; reinstall the
  Pi package from its new path. The format reference moved to
  `docs/FORMAT.md`.
- Turns added to a graph's Pi session from the terminal are imported as graph
  nodes when the graph is next read. Cancelled and failed runs record the
  entry Pi persisted, deleted or undone nodes hide their turns, interrupted
  answers are never imported, and undo keeps every node's entry mapping, so
  the session and the graph cannot drift into duplicates. Schema version 7
  adds the `pi_ignored_entries` table.
- Runs against an unreachable Ollama or custom endpoint fail within about a
  second with an actionable message instead of after Pi's retry schedule;
  rejected credentials and missing project directories are explained too.
- The Pi session index keeps parsed trees only for the eight most recently
  opened sessions and the Pi session view links back to the graph a session
  backs. `/api/diagnostics` reports the Pi directories and extension load
  errors.
- Credentials moved to Pi's own agent directory through `ModelRuntime`:
  ChatGPT sign-in from the settings dialog and `pi /login` now share one
  `auth.json`. The app-owned `.pi-graph-chat/auth.json` and the Codex CLI
  credential import were removed.
- Database schema version 7 adds `graphs.pi_session_path`,
  `nodes.pi_entry_id`, `graphs.project_dir`, and `pi_ignored_entries`.
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

- Graph runs now expose `graph_search` and `graph_get_node` to the model. They
  were filtered out by the tool allowlist, so every call failed.
- API keys set in the environment are recognized for catalog providers;
  before, only keys entered in the settings dialog worked.

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
