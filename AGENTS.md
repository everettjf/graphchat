# Repository Guidelines

Pi Graph Chat is a personal, local-first React/TypeScript learning workspace built on the Pi agent ecosystem. The knowledge graph lives in a local SQLite store; Pi coding-agent sessions are read from Pi's own session directory. Preserve user data and credential isolation.

## Structure

- `src/`: React UI, graph canvas, Pi session view, workspace state, and client services.
- `server/`: local API, SQLite overlay store, Pi runtime integration (`agent-runtime.ts`, `graph-session.ts`), Pi session index, and exports.
- `shared/`: types and schemas shared by client and server.
- `packages/pi-extension/`: the Pi package (extension, skills, prompt templates) installed into the terminal `pi` with `pi install ./packages/pi-extension`.
- `packages/bun-menubar/`: macOS menu bar packaging. A Swift shell (`shell/`) runs the `bun build --compile` server from `Contents/MacOS/server`; `bun run app:build` reads `menubar.config.ts` and writes `dist-app/Pi Graph Chat.app`. macOS only.
- `tests/e2e/`: Playwright workflows, including the seeded Pi session and project fixtures. Specs share one server and database, so `workers` stays at 1 and every spec leaves only the example graph active.
- `docs/`: data format and manual acceptance guide.
- `scripts/`: launcher, provider smoke test, and seeding.

Unit tests sit next to the code they cover (`*.test.ts`, `*.test.tsx`).

## Verification

```bash
bun install
bun run typecheck
bun run test
bun run build
bun run test:e2e
```

Use `bun run test:all` before pushing.

Run Vitest through the package scripts. The scripts force Bun's runtime because the database relies on SQLite FTS5; invoking `vitest` under Node may use a SQLite build without FTS5 and produce misleading failures.

## Menu bar app

- The server binary must stay in `Contents/MacOS` and be signed before the bundle, without `--deep`; notarization rejects executables sealed as resources.
- Signing and notarization settings are `sign` and `notarize` in `menubar.config.ts`, overridden by `MENUBAR_SIGN_IDENTITY`, `MENUBAR_NOTARY_PROFILE`, and `MENUBAR_NOTARY_PASSWORD`. Never write a certificate name, Team ID, or password into the repository; the password is passed to `notarytool` as `@env:`, not on the command line.
- The default entitlements in `packages/bun-menubar/src/sign.ts` are the ones Bun's JIT needs under the hardened runtime; a signed build must still complete a demo answer and load a `~/.pi` extension.
- Test with a copy of the config on another port and `openOnLaunch: false`; the real app shares port 4317 with `bun run launch`. Clean up `~/Library/Application Support/<name>` and `~/Library/Logs/<name>` after probe apps.

## Pi

- Pi packages are pinned to one exact version in `package.json`. Bump all of them together and run the full verification.
- `@earendil-works/pi-coding-agent` is used for `createAgentSession`, `ModelRuntime`, `SessionManager`, and `parseSessionEntries`; do not hand-write a session parser or a provider layer.
- Every graph is backed by a Pi session file (`graphs.pi_session_path`); each answered node records its assistant entry (`nodes.pi_entry_id`). Only `server/graph-session.ts` and the run loop in `server/agent-runtime.ts` write to a graph's session, always through `SessionManager`.
- The Pi session view is read-only. Never write to session files the app did not create.
- Credentials live in Pi's agent directory via `ModelRuntime`; there is no app-owned credential store. Tests must pass a temporary `agentDir` and `sessionRoot` so they never touch `~/.pi`.
- Provider additions go through `CATALOG_PROVIDERS` in `server/agent-runtime.ts` plus the settings dialog and the provider enum in `shared/types.ts`.
- Graph runs use `DefaultResourceLoader`, so the user's Pi extensions, skills, and packages load into the server process. The `pi-graph-chat-extension` extension checks `PI_GRAPH_CHAT_EMBEDDED=1` and stays silent there; keep that guard when changing either side.
- Built-in Pi tools in graph runs are read-only: `read` for plain graphs, `read`/`grep`/`find`/`ls` for graphs with a project directory. Never enable `bash`, `edit`, or `write` from a graph run.
- `GraphSessionSync` imports terminal turns on graph reads; it must skip graphs with an active run (`runtime.isRunning`) and any node the app creates must get its `pi_entry_id` set, including cancelled and failed runs, or the sync imports the turn a second time.
- The terminal extension talks to the server over HTTP only through `/api/graphs/:id/search`, `/api/search`, `/api/nodes/:id`, and `/api/graphs/by-session/:sessionId`. Changing those routes means changing `packages/pi-extension` and its tests.

## Conventions

- Keep OAuth credentials and API keys out of graph exports, SQLite content, logs, and browser storage.
- Version persisted formats and provide migrations for existing `.pi-graph-chat` data.
- Give graph nodes and edges stable identity; do not derive identity from mutable labels.
- Keep the default bind address local-only and require an explicit choice for network exposure.
- Add an end-to-end scenario when changing import, branching, synthesis, review, export, or the Pi session bridge.
- Interface languages are English and Simplified Chinese only.

Keep English and Chinese READMEs aligned. Canonical repository: `https://github.com/everettjf/pi-graph-chat`.
