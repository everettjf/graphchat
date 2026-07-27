# Contributing to Graph Chat

Thanks for helping make graph-native learning better. Bug reports, product ideas, documentation improvements, and code contributions are all welcome.

## Before you start

- Search existing issues before opening a new one.
- For a substantial behavior or architecture change, open a feature request first so the direction can be discussed.
- Never include API keys, OAuth credentials, exported private conversations, or other secrets in issues, tests, or commits.

## Local development

Graph Chat recommends Bun 1.3 or newer. Node.js 22.19 or newer is also supported.

```bash
bun install
bun run dev
```

The web app runs at `http://localhost:5173` and the local API runs at `http://localhost:3000`.

## Quality checks

Run the complete release check before opening a pull request:

```bash
bun run test:all
```

This checks TypeScript, unit and integration tests, the documentation site, the production build, and Playwright end-to-end tests.

The equivalent npm command is `npm run test:all`.

## Pull requests

- Keep each pull request focused on one outcome.
- Explain the user-facing problem and the chosen solution.
- Add or update tests for behavior changes.
- Update the README when setup, security, or supported providers change.
- Keep local-first and credential-safety guarantees intact.

By contributing, you agree that your contribution is licensed under the MIT License.
