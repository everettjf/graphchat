---
name: explain-back
description: Check the user's understanding of a graph node by having them explain it back, then grade the explanation against the node and point out the gap. Use when the user says "let me explain", "check my understanding", "quiz me", or asks to test what they learned.
---

# Explain it back

This is a review loop, not a lecture.

1. Read the target node with `graph_get_node`. If none is referenced, ask the
   user which node to review.
2. Ask the user to explain the concept in their own words in under 120 words.
   Do not explain it yourself first. Wait for the answer.
3. Grade the explanation against the node:
   - **Kept**: the parts that match the node's explanation.
   - **Missing**: the mechanism, boundary, or example the node has and the
     explanation lacks.
   - **Wrong**: statements the node contradicts, quoting the node.
4. Give one follow-up question that targets the biggest gap. Suggest a branch
   title for it, so the user can create it in Pi Graph Chat.

Be direct. A correct explanation gets "Correct" and the one nuance it skipped.
