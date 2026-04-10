<div align="center">
  <h1>🏛️ Po-po-code</h1>
  <p><b>Advanced Multi-Agent Orchestration for OpenCode <i>(Claude Code Edition)</i></b></p>
  <p><i>"Po po!" (Greek: Πω πω!) — An expression of astonishment or surprise.</i></p>
  <p>A highly specialized fork of <a href="https://github.com/alvinunreal/oh-my-opencode-slim">oh-my-opencode-slim</a>, reverse-engineering the internal architecture of Anthropic's Claude Code CLI to solve LLM context flooding.</p>
  <p><b>Status:</b> <i>Alpha — core architecture (context firewalls, advisor pattern, monitor tool) implemented. Phases D–E remaining.</i></p>
  <p><small>Planned npm package name: <code>po-po-code</code> (not published yet)</small></p>
</div>

---

## 📖 The Philosophy: Protect the Orchestrator

Open-source coding agents typically dump every available tool and context file into a single model's prompt.
If you are using a brilliant reasoning model like **Codex 5.3** as your Orchestrator, feeding it 50 Chrome DevTools MCP schemas, 2MB screenshots, and raw server logs will cause **Context Flooding**. The model forgets instructions, slows down, and burns your token budget.

**Po-po-code** aims to restructure how agents communicate using the architectural patterns reflected in Anthropic's Claude Code (including leaked internals and the Monitor & Advisor tool direction):

### ✨ Core Architectural Upgrades

🛡️ **Context Firewalls (Domain Agents)** — *Implemented (Phase A).*
Heavy MCPs stay off the Orchestrator. Instead of giving Codex the `chrome-devtools` MCP directly, a dedicated **`@browser`** agent runs on a large-context model (Gemini 3.1 Pro), absorbs visual/DOM noise internally, and returns only a dense text summary to the Orchestrator. The Orchestrator's MCP list defaults to `[]` — strict isolation by design.

🤝 **The Advisor Pattern (Synchronous Delegation)** — *Implemented (Phase B).*
The unified `delegate_task` tool replaces the old async-only background tasks. The Orchestrator delegates to a sub-agent and, when `run_in_background` is false (Advisor mode), receives the result inline without leaving the conversational loop. Set `run_in_background: true` for long-running tasks like builds.

👀 **The Monitor Tool (Event-Driven Wakeups)** — *Implemented (Phase C).*
No more token-heavy polling loops. The `create_monitor` tool lets the Orchestrator attach a detached script (e.g. `tail -f | grep 'Error'`); on match, OpenCode injects a `<system-reminder>` to wake the Orchestrator.

---

## 🏛️ Agent Roles

| Agent | Model (copilot preset) | Role & isolated MCPs |
| :--- | :--- | :--- |
| **@orchestrator** | `gpt-5.3-codex` | **The Brain.** Answers simple queries; delegates heavy work. *No heavy MCPs — pristine context.* |
| **@browser** | `gemini-3.1-pro-preview` | **Visual / UI path.** Holds `chrome-devtools` behind a context firewall. |
| **@ops** | `gemini-3-flash-preview` | **Execution / ops path.** Builds, logs, `bash`, `monitor`. |
| **@explorer** | `gemini-3-flash-preview` | **Codebase scout.** Holds `serena`, `morph-mcp`. |
| **@designer** | `gemini-3.1-pro-preview` | **UI/UX specialist.** Design frameworks and implementation. |
| **@oracle** | `claude-opus-4.6` | **Deep reasoning** for hard bugs and architecture. |

---

## 📦 Installation & Setup

### Quick Start (after first npm release)

```bash
bunx po-po-code@latest install
```

### Current setup (before npm publish)

```bash
git clone https://github.com/tinof/po-po-code.git
cd po-po-code
bun install
bun run build
bun run dev
```

The installer defaults to the **copilot** preset (Codex orchestrator + Gemini sub-agents via GitHub Copilot). After npm publish, you can use a different provider with:

```bash
bunx po-po-code@latest install --preset=openai
bunx po-po-code@latest install --preset=copilot
bunx po-po-code@latest install --preset=kimi
bunx po-po-code@latest install --preset=zai-plan
```

### Configuration files

Config files (JSONC supported) are written to:

- **User:** `~/.config/opencode/po-po-code.jsonc`
- **Project:** `.opencode/po-po-code.jsonc`

Project config overrides user config. See [docs/configuration.md](docs/configuration.md) for the full layering story.

### Copilot preset (default)

The `copilot` preset keeps the Orchestrator lean while sub-agents use large-context Gemini models for context firewalls:

```jsonc
{
  "preset": "copilot",
  "agents": {
    "orchestrator": {
      "model": "github-copilot/gpt-5.3-codex",
      "temperature": 1,
      "variant": "high",
      "mcps": [] // Pristine context
    },
    "browser": {
      "model": "google/gemini-3.1-pro-preview",
      "temperature": 1,
      "mcps": ["chrome-devtools"] // Context firewall
    },
    "ops": {
      "model": "github-copilot/gemini-3-flash-preview",
      "temperature": 1,
      "mcps": []
    },
    "explorer": {
      "model": "github-copilot/gemini-3-flash-preview",
      "temperature": 1,
      "mcps": ["serena", "morph-mcp"]
    }
  }
}
```

To override individual agents without changing presets, add entries under `"agents"` — they merge on top of the active preset.

---

## 🗺️ Roadmap (Claude Code Parity)

Detailed tasks live in [opencode-parity-plan.md](opencode-parity-plan.md). Summary:

| Phase | Focus | Status |
| :--- | :--- | :--- |
| **A** | Domain agents & context firewalls | ✅ `@browser`, `@ops`, `@designer` roles; strict orchestrator MCP firewall. |
| **B** | Advisor pattern | ✅ `delegate_task` with `run_in_background`; sync and async delegation. |
| **C** | Monitor tool | ✅ `create_monitor` — detached scripts, stdout triggers, `<system-reminder>` wakeups. |
| **D** | System reminders & caching | Planned — `SYSTEM_PROMPT_DYNAMIC_BOUNDARY`; hooks use `<system-reminder>` consistently. |
| **E** | Memory & cost | Planned — tiered `CLAUDE.md` hierarchy; cost visibility for large-context sub-agents. |

---

## 🛠️ Usage Examples

### The Monitor Pattern

> "Start the NextJS dev server. Monitor the output, and wake up to fix any TypeScript errors that appear in the logs."

The Orchestrator delegates to `@ops` to run the dev server, then uses `create_monitor` to attach a background watcher on stdout. When a TypeScript error appears in the logs, a `<system-reminder>` wakes the Orchestrator — no polling loops, no wasted tokens.

### The Context Firewall Pattern

> "Check why the login button isn't working on localhost:3000."

The Orchestrator delegates to `@browser`, which uses Chrome DevTools to capture screenshots, inspect the DOM, and check network requests. It returns a short text diagnosis (e.g. "CORS error on `/api/auth`") so the Orchestrator never ingests a multi-megabyte screenshot.

### The Advisor Pattern

> "What's the current directory structure of src/agents?"

The Orchestrator delegates to `@explorer` with `run_in_background: false` (Advisor mode). The explorer runs the lookup synchronously and returns the result inline — the Orchestrator continues its thought process without interruption.

---

## 🙏 Credits & Upstream

**Po-po-code** is a specialized, heavily opinionated fork of **[oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim)**, which itself descends from **[oh-my-opencode](https://github.com/alvinunreal/oh-my-opencode)** created by Alvin and the Boring Dystopia Development team.

While the upstream project focuses on a broad, highly customizable agent suite with TUI multiplexing, **Po-po-code** strips away generic roles to focus on replicating the tight, autonomous, CLI-native developer experience of Anthropic's Claude Code using context firewalls and the parity roadmap above.

Huge thanks to the original contributors for building the foundation and hook system that makes this architectural direction possible.

---

<p align="center"><i>"To make every token valuable, to make every cache hit, and to make every layer of extension a seamless integration."</i></p>
