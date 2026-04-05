# Collab Agent Design

A first-party project-level AI agent integrated into Collaborator's sidebar, replacing the terminal-based agent panel with a purpose-built chat UI backed by coding agents via the Agent Client Protocol (ACP).

## Problem

In agentic development sessions, there is no concept of a persistent agent that understands the project at a high level. All agent interaction happens in individual terminal sessions, deep in the weeds on specific threads. There is no orchestrator that tracks goals, dispatches work, and maintains awareness of what's happening across the workspace.

The terminal-based agent sidebar was a wrong turn: it has terminal UI, it's a text interface, and there's a shell escape hatch. These are things we don't want. The agent sidebar should be a purpose-built conversation surface.

## Solution

A collab-agent that lives in the right sidebar as a chat UI. It's backed by a real coding agent (Claude Code, Codex, Gemini CLI, etc.) running headless via ACP, configured by the user. The agent is shaped into the "collab-agent" role by Collaborator-provided system prompts and tools — it's not a custom AI, it's a stock agent with canvas superpowers.

The collab-agent doesn't write code itself. It operates through sub-agents it spawns in terminal tiles (or headless). It understands the project at a high level, tracks what's happening via a canvas event log, and surfaces relevant information when needed.

## Phases

Three independently shippable phases, each building on the last.

---

## Phase 1: First-Party Chat Sidebar with ACP Agent

### Architecture

The ACP agent runs in a **sidecar process**, following the same pattern as the existing PTY sidecar (`src/main/sidecar/`). This gives process isolation (agent crashes don't take down the app), survivability (agent outlives app restarts), and consistency with existing infrastructure.

The sidecar manages a **pool of agent sessions**, not a singleton. Each session has an ID, its own ACP process, its own conversation history. Phase 1 uses a single "primary" session, but nothing assumes singularity.

```
Agent Sidecar Process
├── Manages ACP agent child processes
├── Listens on ~/.collaborator/agent-sidecar.sock
├── JSON-RPC methods:
│   - agent.create → spawn new agent session, returns session ID
│   - agent.send(sessionId, message, context) → user message to agent
│   - agent.stream(sessionId) → stream of agent response chunks
│   - agent.status(sessionId) → running/idle/error
│   - agent.stop(sessionId) → kill session
│   - agent.list → all active sessions
│   - sidecar.ping / sidecar.shutdown
├── Buffers conversation history per session
└── Routes agent tool calls → Collaborator's JSON-RPC server

Electron Main Process
├── Launches agent sidecar (same lifecycle as PTY sidecar)
├── Connects via JSON-RPC client
├── Forwards IPC: chat sidebar renderer ↔ sidecar
└── Handles canvas tool calls from agent

Chat Sidebar (React renderer in right panel)
├── Rendered markdown messages
├── Text input with implicit context
├── Conversation scroll history
└── Communicates with main process via Electron IPC
```

### Agent Session Storage

Each agent session gets a durable directory:

```
~/.collaborator/agents/
  <session-id>/
    config.json        # agent type, model, creation time
    memory/            # agent's persistent memory/identity files
    conversation.json  # message history for reconnection/scroll-back
```

The primary collab-agent uses a well-known path (`agents/primary/`). Additional agents get generated IDs. Collaborator controls what identity and memory files are placed in this directory and points the agent at it.

Future: when agents are tied to canvases, this moves under `~/.collaborator/canvases/<canvas-id>/agents/<session-id>/`.

### ACP Integration

The user configures their preferred agent in Collaborator settings:

```json
{
  "agent": {
    "command": "claude",
    "args": ["--experimental-acp"],
    "name": "Claude Code"
  }
}
```

When `agent.create` is called, the sidecar:

1. Spawns the agent binary as a child process with ACP flags
2. Establishes an ACP session (protocol handles capability negotiation)
3. Injects the Collaborator system prompt — canvas skill instructions plus collab-agent role instructions ("you are the project-level orchestrator, you don't write code yourself, you manage sub-agents")
4. Registers canvas operations as tools via ACP's tool-use mechanism (tile CRUD, terminal read/write, focus, layout)

When the user sends a message, the sidecar:

1. Appends implicit context (viewport bounds, selected tile IDs, workspace path)
2. Forwards to the ACP agent
3. Streams the response — text chunks go to the chat UI, tool calls route to Collaborator's JSON-RPC handler, tool results flow back to the agent

The ACP layer is a swappable adapter within the sidecar. If ACP doesn't work for a given agent, the sidecar can fall back to stdin/stdout JSON mode (e.g., Claude Code's `--output-format stream-json`). Nothing outside the sidecar needs to know which protocol is in use.

### Chat UI

The sidebar replaces the current terminal-based agent panel in the right panel. It's a React app rendered in a webview, using the existing panel infrastructure and component library.

**Layout (top to bottom):**

- **Header bar** — agent name/model indicator, connection status dot (green/reconnecting/error), settings gear
- **Message list** — scrollable conversation. User messages right-aligned, agent messages left-aligned. Agent messages rendered as markdown with syntax-highlighted code blocks. Timestamps on messages.
- **Input area** — text box, shift+enter for newlines, enter to send. Plain text, no slash commands.

**Implicit context sent with each message (invisible to user):**

- Current viewport bounds (which canvas region they're looking at)
- IDs and metadata of any selected/highlighted tiles
- Current workspace path

The sidebar uses the existing panel manager and gets a keyboard shortcut to toggle.

---

## Phase 2: Headless Sub-Agent Pool and Status Panel

The collab-agent gains the ability to spawn and manage additional agent sessions through the same sidecar. New tools added to the collab-agent's tool set:

- `spawn_agent` — create a new headless agent session with a task description
- `check_agent(sessionId)` — read status and recent output
- `stop_agent(sessionId)` — kill a session
- `attach_agent(sessionId)` — create a terminal tile on the canvas connected to the agent's I/O

Detaching a tile doesn't kill the agent. The agent process lifecycle is independent of any UI.

**Status panel** sits above the chat in the sidebar. Shows active sub-agents: name/task, status (running/done/errored), attach button. The collab-agent can also attach agents programmatically via canvas tools.

Sub-agents are stored under `~/.collaborator/agents/<session-id>/` like the primary agent but are spawned on demand and potentially shorter-lived.

The collab-agent's system prompt is extended with orchestration instructions: break down tasks, dispatch to sub-agents, monitor progress, report back.

---

## Phase 3: Canvas Event Log as Agent Context

An append-only event log captures:

- **Canvas mutations** — tile created, moved, resized, closed; viewport changes
- **Terminal bookends** — user input submissions, agent final responses (not streaming middle)
- **Agent sidebar messages** — user messages and collab-agent responses

Stored as newline-delimited JSON at `~/.collaborator/event-log.jsonl` (or per-canvas when that lands). Each entry has a timestamp, event type, and payload.

**Dual purpose:**

1. **Undo/redo** — canvas state is reconstructable from the log, enabling time-travel through mutations
2. **Agent context** — the collab-agent reads recent events on wake-up to understand what's been happening. A sliding window or summary keeps context bounded.

**Wake-up logic:** New events append to the log. The sidecar evaluates significance. If significant, it sends the recent event window to the agent and asks if it has anything to surface. Two wake-up triggers: direct user messages, and event log activity.

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Agent sidebar surface | Purpose-built chat UI, not terminal | Terminal UI, shell escape hatch, text-only rendering are wrong for a project-level agent |
| Agent runtime | Sidecar process (like PTY sidecar) | Process isolation, survivability across app restarts, consistent pattern |
| Agent pool | Multi-session from the start | Avoids singleton assumptions; Phase 2 sub-agents use the same infrastructure |
| Underlying agent | User-configured ACP agent (Claude Code, Codex, Gemini CLI) | Not a custom AI — stock agent shaped by Collaborator's instructions and tools |
| Agent identity | Collab-managed directory per session | Collaborator controls memory/identity files, points agent at them |
| Agent capabilities | Canvas CLI tools via system prompt | Same mechanism as existing terminal agent integration |
| Context passing | Viewport + selected tiles + workspace, implicit per message | Canvas is the context mechanism — no drag-and-drop or slash commands needed |
| ACP as protocol layer | Swappable adapter inside sidecar | ACP is young; fallback to stdin/stdout JSON keeps options open |
| Event log | Append-only JSONL, canvas mutations + terminal bookends | Serves undo/redo, agent context, and state reconstruction |
| Agent proactivity | Wake on direct message or significant events | Not always-on narration; thoughtful colleague who speaks up when it matters |
