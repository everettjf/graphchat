# Graph Chat core feature test guide

This guide verifies the product loop introduced for the first six months:
source material -> branch -> compare -> synthesize -> mark as knowledge -> review -> export.

## Automated acceptance

From the repository root:

```bash
npm install
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Expected result:

- TypeScript client and server checks pass.
- Unit tests cover database migration, import, metadata, metrics, study cards,
  Markdown export, context compilation, runtime streaming, cancellation, and
  credential handling.
- Playwright covers the complete browser workflow, including import and
  knowledge-asset updates.

For a faster test while developing the new learning workspace:

```bash
npx playwright test tests/e2e/app.spec.ts -g "imports source notes"
```

## Manual core-loop acceptance

Start the app with an isolated data directory so existing data is untouched:

```powershell
$env:GRAPHCHAT_DATA_DIR="$PWD\.graphchat-manual-test"
npm run graphchat
```

Open `http://127.0.0.1:4317`.

### 1. Large-graph navigation

1. Select a node with children.
2. Click **Collapse**. Descendants should disappear while the selected node remains.
3. Click **Expand**. Descendants should return.
4. Click **Focus**. The viewport should center and zoom around the selected node.
5. Drag several nodes, then click **Layout**. Nodes should be arranged by branch
   depth and remain in those positions after reload.

Pass condition: no node or edge is deleted, references remain dashed, and the
layout survives reload.

### 2. Branch and cross-branch synthesis

1. Open one node and click **Add to synthesis**.
2. Repeat with a node from another branch.
3. Open **Learning workspace**.
4. Confirm both nodes appear side by side under **Branch comparison**.
5. Click **Synthesize selected branches**, enter a question, and send it.

Pass condition: the new synthesis node has reference edges from all selected
nodes. Its answer separates consensus, conflicts, evidence by source, and open
questions. Exported JSON should show those edges with `kind: "reference"`.

### 3. Source import and traceability

1. Open **Learning workspace**.
2. Paste the example below, or choose a local `.md`, `.txt`, or text-based
   `.pdf` file:

   ```markdown
   # Claim

   A system can remain available during a partition.

   # Trade-off

   It may have to return stale data.
   ```

3. Add a source URL and import it.
4. Open both imported nodes.

Pass condition: two note nodes are created, connected in source order, tagged
`imported`, and each retains the source URL.

For PDF, pass condition additionally requires one imported section per page.
Scanned image-only PDFs require OCR before import; Graph Chat does not silently
pretend that an image-only page contained readable text.

### 4. Knowledge asset lifecycle

1. Open an imported or generated node.
2. Click **Suggest tags and summary**, inspect the suggestions, then add or remove
   tags as needed.
3. Set **Knowledge status** to **Verified** or **Conclusion**.
4. Set **Mastery** to **Learning** or **Mastered**.
5. Mark the answer helpful or not helpful.
6. Reload.

Pass condition: every field survives reload. Searching for one of the tags or
the source URL finds the node. Exact title matches rank before summary/body-only
matches.

Open a generated answer and inspect **Context actually used**. Pass condition:
the source-node titles and inclusion reasons are visible, omitted-node count is
reported, and the snapshot remains available after reload.

### 5. Study loop

1. Mark one node **New**, another **Learning**, and another **Mastered**.
2. Open **Learning workspace**.
3. Expand cards in **Study queue**.

Pass condition: incomplete mastery appears before mastered material. Each node
produces recall, concept, and counterexample cards.

### 6. Metrics and reusable conclusions

1. Select two nodes for synthesis and create a synthesis node.
2. Give that node a non-empty summary and mark it **Conclusion**.
3. Open **Learning workspace**.

Pass condition: **Reusable conclusions** increases when a conclusion has a
summary and at least two incoming branch/reference edges.

The workspace should also show non-zero **7-day activity** after opening,
branching, synthesizing, or importing. The metrics endpoint retains timestamps
for the first branch, first synthesis, and most recent graph open.

### 7. Portability

1. Click **Export graph as Markdown**.
2. Open the downloaded file.
3. Click **Download full backup**.
4. Choose **Restore backup** and select that JSON file.

Pass condition: Markdown contains graph title, node headings, prompts, content,
tags, source URLs, and Obsidian-style `[[links]]`. JSON contains graph structure,
context snapshots, and all knowledge metadata, but no API key or OAuth
credential. Restore creates a separate graph with `(restored)` in its title and
does not overwrite the original.

### 8. Undo safety

1. Change a node tag or mastery state.
2. Click **Undo** in the top bar.
3. Reload the graph.
4. Delete a disposable node, then click **Undo** again.

Pass condition: each undo restores the immediately preceding persisted graph
snapshot, including nodes and edges. Undo history is local, graph-scoped, and
bounded to the latest 100 mutations.

## Performance smoke test

Import a Markdown document with 100 headings. Verify:

- import completes without freezing the browser;
- collapse, focus, search, and layout remain usable;
- reload preserves all 100 nodes;
- `/api/graphs/{graphId}/metrics` reports the expected node count.

This is a smoke test, not a benchmark. Before claiming the 100–200 node product
gate, record interaction latency on at least one low-end and one typical laptop.

## Product validation

Run 8–12 observed sessions with target users. Give each person a real source and
ask them to produce one defensible conclusion. Record:

- time to first branch;
- time to first cross-branch synthesis;
- whether the final conclusion has two or more sources;
- whether the user can relocate and explain it one week later;
- whether the graph helped more than opening separate chats.

The feature set passes the product gate only if users complete the loop without
coaching and return to the graph; automated tests prove correctness, not value.
