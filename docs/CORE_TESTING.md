# Pi Graph Chat core feature test guide

This guide verifies the product loop introduced for the first six months:
source material -> branch -> compare -> synthesize -> mark as knowledge -> review -> export.

## Automated acceptance

From the repository root:

```bash
bun install
bun run typecheck
bun run test
bun run build
bun run test:e2e
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
bun run launch
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
Scanned image-only PDFs require OCR before import; Pi Graph Chat does not silently
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

## Graph-backed Pi sessions

Open the example RAG graph, add a reference to "What does a vector database
do?", select "What exactly is an embedding?", and ask a synthesis question.
Verify:

- the answer streams and is saved as a node with a reference edge;
- the graph's session appears under **Pi sessions** with the graph's title;
- the new prompt is a child of the embedding node's answer in that tree, and
  a `graphchat.references` entry precedes it;
- the topbar terminal button copies a `pi --session` command, and running it
  resumes the conversation at the new answer.

## Codebase-rooted graphs and references

Create a graph with a project directory that contains code. Verify:

- the topbar shows the project folder name and **Open in terminal** copies a
  command that starts `pi` in that directory;
- asking "what does this repository do" makes the model read files and cite
  paths (with a real model), and the session file's system message names the
  project directory;
- marking a node as a reference, then starting a new thread, shows the node as
  a chip in the composer and the answer's Context tab lists it;
- in a terminal Pi session, **Use as reference** on a turn adds a chip, and the
  next answer's Context tab lists `Pi · …` with the turn title.

Install the Pi package with `pi install ./packages/graphchat-pi`, run `pi` in
any project, and verify `/graph status`, `/ref <words>`, and `graph_search`
work against the running server.

## Pi sessions

Run `pi` in any project, ask two questions, then use `/tree` to branch from the
first answer and ask a third. Open Pi Graph Chat and verify:

- the session appears under **Pi sessions** in the sidebar with its working
  directory and a relative time;
- the canvas shows three turn cards, one of them marked as an abandoned branch
  and one as the current position;
- selecting a card shows its prompt, response, tool calls, and model;
- **Open in terminal** copies a `pi --session` command that resumes the session;
- while `pi` is still running, new turns appear within a few seconds without a
  reload.
