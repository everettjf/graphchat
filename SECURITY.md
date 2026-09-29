# Security policy

## Supported versions

Pi Graph Chat is in early development. Security fixes are applied to the latest version on the `main` branch.

## Reporting a vulnerability

Please do not disclose a vulnerability in a public issue.

Use GitHub's **Report a vulnerability** flow in the repository's Security tab. Include:

- the affected version or commit;
- the impact and conditions required to reproduce it;
- minimal reproduction steps or a proof of concept;
- any suggested mitigation, if available.

Please avoid including real API keys, OAuth tokens, or private conversation data. You should receive an initial response within seven days.

## Credential model

- Provider API keys are kept in the server process and are not written to the graph database.
- ChatGPT OAuth credentials are stored by Pi in its own agent directory (`~/.pi/agent/auth.json` by default), outside exported graphs. Pi Graph Chat reads and writes that file only through Pi's `ModelRuntime`.
- Graph conversations are written to Pi session files under Pi's session directory. They contain prompts and answers, never credentials.
- Authentication responses sent to the browser contain status metadata only, never access or refresh tokens.
- Pi Graph Chat does not operate a hosted credential service in this release.

If you deploy Pi Graph Chat beyond localhost, add transport security, access control, isolated secret storage, and an explicit threat model for your environment.
