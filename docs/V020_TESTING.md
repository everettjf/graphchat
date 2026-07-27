# Graph Chat v0.2.0 release and product-validation testing

## 1. Complete automated acceptance

From a clean checkout:

```powershell
npm ci
npm run release:validate
npm run test:all
npm pack --dry-run
```

Expected:

- release metadata reports version `0.2.0`;
- both client and server type checks pass;
- all unit, migration, runtime, and browser tests pass;
- the production build completes;
- the npm package includes `CHANGELOG.md` and all three operational guides;
- `git status --short` remains empty after verification.

CI additionally installs with `bun install --frozen-lockfile` and
`npm ci --ignore-scripts`, preventing either lockfile from drifting.

## 2. v0.1.1 database upgrade

Make a recoverable copy before testing:

```powershell
Copy-Item .graphchat .graphchat-v011-backup -Recurse
npm run graphchat
```

Open the existing graph and verify that old nodes, edges, provider settings,
positions, and archived graphs still exist. Then exercise tags, mastery, source
metadata, undo, and validation export.

Check the health endpoint:

```powershell
Invoke-RestMethod http://127.0.0.1:4317/health
```

Expected:

```text
ok                    : True
service               : graphchat
version               : 0.2.0
databaseSchemaVersion : 2
```

The automated migration test constructs a legacy database without v0.2.0
columns, opens it through Graph Chat, and verifies `PRAGMA user_version = 2`.

## 3. Activation instrumentation

Use a new graph so the result is easy to identify:

1. Open **Learning workspace** and import a source with at least two sections.
2. Create a branch from one imported node.
3. Add another source node to synthesis and generate a synthesis.
4. Give the synthesis a non-empty summary and mark it **Conclusion**.
5. Reopen **Learning workspace -> Product validation**.

Expected:

- eligible graphs increases after import or branching;
- activated graphs increases only after synthesis plus an evidence-backed conclusion;
- evidence coverage counts the conclusion only when it has two distinct incoming
  evidence nodes;
- completed, cancelled, and failed model runs are counted separately.

## 4. Privacy test

Use unique phrases in a prompt, generated answer, graph title, and source URL.
Download **Product validation report**, then search its JSON.

Expected: none of those phrases appears. The report may contain graph IDs,
timestamps, versions, counts, durations, rates, and aggregate session counts.
It must not contain source material or credentials.

For an API-level check:

```powershell
Invoke-RestMethod http://127.0.0.1:4317/api/validation/export.json |
  ConvertTo-Json -Depth 10
```

## 5. Seven-day return

The automated database test creates two sessions eight days apart and verifies
the return calculation. For the real pilot:

1. keep the same data directory;
2. close Graph Chat after the first session;
3. reopen the same graph seven or more days later;
4. download the validation report.

Expected: `returnedAfter7Days` is true for that graph and the aggregate return
rate updates. Multiple reloads in one browser tab retain one session ID and do
not masquerade as distinct sessions.

## 6. Release artifacts

Push a release-candidate branch and let GitHub Verify pass. For the actual
release, create tag `v0.2.0`. The Release workflow must produce:

- Windows x64 ZIP;
- Linux x64 and ARM64 tarballs;
- macOS x64 and ARM64 tarballs;
- npm package tarball;
- `SHA256SUMS.txt`.

Each standalone archive must contain the executable, built web client, license,
readmes, changelog, and operational guides.
