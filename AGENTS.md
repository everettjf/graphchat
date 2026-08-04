# Repository Guidelines

Graph Chat is a local-first React/TypeScript learning workspace backed by a graph-oriented local store and a shared server runtime. Preserve user data and credential isolation across migrations.

## Structure

- `src/`: React UI, graph canvas, workspace state, and client services.
- `server/`: local API, SQLite persistence, credentials, provider integration, and exports.
- `tests/`: Vitest coverage.
- `e2e/`: Playwright workflows.
- `docs/`: data format, product validation, and release checklists.
- `scripts/`: release, validation, seeding, and packaged CLI entry points.

## Verification

```bash
bun install
bun run typecheck
bun run test
bun run build
bun run test:e2e
```

Use `bun run test:all` before releases.

## Conventions

- Keep OAuth credentials and API keys out of graph exports, SQLite content, logs, and browser storage.
- Version persisted formats and provide migrations for existing `.graphchat` data.
- Give graph nodes and edges stable identity; do not derive identity from mutable labels.
- Keep the default bind address local-only and require an explicit choice for network exposure.
- Add an end-to-end scenario when changing import, branching, synthesis, review, or export.

Keep English and Chinese READMEs aligned. Canonical repository: `https://github.com/everettjf/graphchat`.
