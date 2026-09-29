---
name: graph-compare
description: Compare two concepts or graph nodes side by side on definition, role in the system, failure modes, and when to use which. Use when the user asks how two ideas differ, which to pick, or references exactly two nodes.
---

# Compare two nodes

1. Fetch both nodes with `graph_get_node`. If only one node is referenced,
   search for the other with `graph_search` and confirm the match with the
   user before continuing.
2. Produce a table with these rows: definition, input, output, where it sits
   in the pipeline, typical failure, cost or trade-off.
3. After the table, write "Use A when …" and "Use B when …" in one line each.
4. Cite the node for every cell that comes from the graph as `[Node: ID]`;
   mark cells that come from general knowledge as "(general)".

Keep the comparison to what the two nodes actually say. Differences the graph
does not support go into a final "Not covered by the graph" line.
