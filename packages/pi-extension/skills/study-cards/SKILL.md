---
name: study-cards
description: Turn graph nodes into recall, concept, and counterexample study cards. Use when the user asks for flashcards, review questions, or a study set from the graph.
---

# Study cards from the graph

1. Collect the nodes to cover: referenced nodes first, otherwise the results of
   `graph_search` for the topic the user names. Read each with
   `graph_get_node`.
2. For every node write three cards, each as a question and an answer:
   - **Recall**: the definition, in the node's words.
   - **Concept**: why it exists or what breaks without it.
   - **Counterexample**: a case where the concept does not apply or fails.
3. Output as a Markdown list grouped by node, with `[Node: ID]` on the group
   heading so the cards stay traceable.
4. Finish with the three cards the user is most likely to get wrong, and why.

Keep answers under 40 words. Never add facts that are not in the node.
