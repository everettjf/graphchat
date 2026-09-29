---
name: graph-synthesize
description: Combine two or more branches of a Pi Graph Chat knowledge graph into one explanation with explicit consensus, conflicts, evidence, and open questions. Use when the user asks to synthesize, merge, or reconcile branches, or references several graph nodes at once.
---

# Synthesize graph branches

Use this when several graph nodes or branches are in context, for example after
`/ref` or when a `pi-graph-chat.references` message is present.

1. Read every referenced node in full with `graph_get_node` before writing.
   Do not rely on summaries.
2. Name the shared object the branches are about in one sentence.
3. Write exactly four sections, in this order:
   - **Consensus**: claims every branch supports, each cited as `[Node: ID]`.
   - **Conflicts**: definitions, scope, or assumptions that disagree. Keep them
     unresolved unless a cited node resolves them.
   - **Evidence by source node**: one bullet per node, what it contributes.
   - **Open questions**: what a new branch should test next.
4. End with one causal chain: input, transformation, who uses the output.

Never invent a node id. If a branch is missing, say which one and stop.
