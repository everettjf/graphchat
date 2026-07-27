# Security policy

## Supported versions

Graph Chat is in early development. Security fixes are applied to the latest version on the `main` branch.

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
- ChatGPT OAuth credentials are stored locally in `.graphchat/auth.json`, outside exported graphs, with restrictive file permissions where the operating system supports them.
- Authentication responses sent to the browser contain status metadata only, never access or refresh tokens.
- Graph Chat does not operate a hosted credential service in this release.

If you deploy Graph Chat beyond localhost, add transport security, access control, isolated secret storage, and an explicit threat model for your environment.
