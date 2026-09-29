# pi-graph-chat-extension

The Pi package for [Pi Graph Chat](../../README.md). It gives the terminal
`pi` the same graph tools the web app uses, plus learning skills.

## Install

```bash
# from the repository root, into your personal Pi configuration
pi install ./packages/pi-extension
```

The extension talks to a running Pi Graph Chat server. Start it with
`bun run launch` (default `http://127.0.0.1:4317`; override with
`PI_GRAPH_CHAT_URL`).

## What you get

| Resource | Purpose |
| --- | --- |
| `graph_search`, `graph_get_node` tools | Search and read graph nodes. Scoped to the graph behind the current session when the session was started from Pi Graph Chat, otherwise across every graph |
| `/graph` | Open the current session in the web app. `/graph use <graph id>` binds a plain session to a graph; `/graph status`, `/graph unbind` |
| `/ref <node id \| words>` | Inject a graph node into the model context as a `pi-graph-chat.references` entry, the same mechanism the web app uses |
| `graph-synthesize` skill | Four-section synthesis of referenced branches |
| `graph-compare` skill | Side-by-side comparison of two nodes |
| `explain-back` skill | Have the user explain a node back and grade it |
| `study-cards` skill | Recall, concept, and counterexample cards from nodes |
| `/branch <concept>`, `/synthesize [question]` prompts | Learning prompts that mirror the web app's branch and synthesis actions |

## Typical loop

1. In the web app, ask a question and branch a few times.
2. Click **Open in terminal** on the graph. The terminal session already has
   the graph tools scoped to that graph.
3. Continue in the terminal with Pi's coding tools, `/ref` other nodes, or
   `/skill:explain-back` to review.
4. `/graph` jumps back to the web app on the same session.

The extension is a no-op inside the Pi Graph Chat server process
(`PI_GRAPH_CHAT_EMBEDDED=1`), where the server registers the graph tools itself.
