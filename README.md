<div align="center">
  <h1>🏛️ Po-po-code</h1>
  <p><b>Advanced Multi-Agent Orchestration for OpenCode <i>(Claude Code Edition)</i></b></p>
  <p><i>"Po po!" (Greek: Πω πω!) — An expression of astonishment or surprise.</i></p>
  <p>A highly specialized fork of <a href="https://github.com/alvinunreal/oh-my-opencode-slim">oh-my-opencode-slim</a>, reverse-engineering the internal architecture of Anthropic's Claude Code CLI to solve LLM context flooding.</p>
  <p><b>Status:</b> <i>Alpha — architecture and roadmap defined; Claude Code parity work is in progress.</i></p>
  <p><small>Published npm package: <code>oh-my-opencode-slim</code> (this README uses <b>Po-po-code</b> as the project name for this fork).</small></p>
</div>

---

## 📖 The Philosophy: Protect the Orchestrator

Open-source coding agents typically dump every available tool and context file into a single model's prompt.
If you are using a brilliant reasoning model like **Codex 5.3** as your Orchestrator, feeding it 50 Chrome DevTools MCP schemas, 2MB screenshots, and raw server logs will cause **Context Flooding**. The model forgets instructions, slows down, and burns your token budget.

**Po-po-code** aims to restructure how agents communicate using the architectural patterns reflected in Anthropic's Claude Code (including leaked internals and the Monitor & Advisor tool direction):

### ✨ Core Architectural Upgrades

🛡️ **Context Firewalls (Domain Agents)** — *Roadmap (see [parity plan](opencode-parity-plan.md), Phase A).*
Heavy MCPs stay off the Orchestrator. Instead of giving Codex the `chrome-devtools` MCP directly, a dedicated domain agent (today **`@designer`**, target rename **`@browser`**) runs on a large-context model (e.g. Gemini 3.1 Pro), absorbs visual/DOM noise internally, and returns only a dense text summary to the Orchestrator.

🤝 **The Advisor Pattern (Synchronous Delegation)** — *Roadmap (Phase B).*
Replace awkward async-only delegation with **Advisor**-style calls: the Orchestrator delegates to a sub-agent and, when `run_in_background` is false, receives the result inline without leaving the conversational loop. Today, background tasks exist; unified `delegate_task` with sync mode is planned.

👀 **The Monitor Tool (Event-Driven Wakeups)** — *Roadmap (Phase C).*
Avoid token-heavy polling loops. The Monitor tool will let the Orchestrator attach a detached script (e.g. `tail -f | grep 'Error'`); on match, OpenCode injects a `<system-reminder>` to wake the Orchestrator.

---

## 🏛️ Agent Roles (Today vs Claude Code Parity)

The plugin ships **`orchestrator`**, **`designer`**, **`fixer`**, **`explorer`**, and **`oracle`**. The [parity plan](opencode-parity-plan.md) renames domain agents for clarity: **`designer` → `browser`**, **`fixer` → `ops`**. Until those renames land, configure and delegate using the **current** keys.

| Current agent | Parity target | Ideal model (example) | Role & isolated MCPs |
| :--- | :--- | :--- | :--- |
| **@orchestrator** | *(unchanged)* | `Codex 5.3` | **The Brain.** Answers simple queries; delegates heavy work. *No heavy MCPs.* |
| **@designer** | **@browser** | `Gemini 3.1 Pro` | **Visual / UI path.** *Target:* holds `chrome-devtools` behind a context firewall. |
| **@fixer** | **@ops** | `Gemini 3 Flash` | **Execution / ops path.** *Target:* builds, logs, `bash`, `monitor`. |
| **@explorer** | *(unchanged)* | `Gemini 3 Flash` | **Codebase scout.** *Holds `serena`, `morph-mcp`.* |
| **@oracle** | *(unchanged)* | `Gemini 3.1 Pro` | **Deep reasoning** for hard bugs and architecture. |

---

## 📦 Installation & Setup

### Quick Start

```bash
bunx oh-my-opencode-slim@latest install
```

### Recommended configuration

Use the plugin config file (JSONC supported). Typical locations:

- **Project:** `.opencode/oh-my-opencode-slim.jsonc`
- **User:** `~/.config/opencode/oh-my-opencode-slim.jsonc`

See [docs/configuration.md](docs/configuration.md) for the full layering story.

To **prepare for** the Advisor pattern and context firewalls, mix providers so the Orchestrator stays lean while sub-agents use large-context models. Example (illustrative — adjust models to your OpenCode providers):

```jsonc
{
  "disabled_mcps": ["websearch", "grep_app"],
  "agents": {
    "orchestrator": {
      "model": "github-copilot/gpt-5.3-codex",
      "temperature": 0.7,
      "variant": "high",
      "mcps": [] // Keep orchestrator context pristine
    },
    "designer": {
      "model": "google/gemini-3.1-pro-preview",
      "temperature": 0.1,
      "mcps": ["chrome-devtools"] // Context firewall (when wired to this agent)
    },
    "fixer": {
      "model": "github-copilot/gemini-3-flash-preview",
      "temperature": 0.1,
      "mcps": []
    },
    "explorer": {
      "model": "github-copilot/gemini-3-flash-preview",
      "temperature": 0.2,
      "mcps": ["serena", "morph-mcp"]
    }
  }
}
```

When Phase A renames agents, swap `designer` / `fixer` keys to `browser` / `ops` in config to match the updated schema.

---

## 🗺️ Roadmap (Claude Code Parity)

Detailed tasks live in [opencode-parity-plan.md](opencode-parity-plan.md). Summary:

| Phase | Focus | Notes |
| :--- | :--- | :--- |
| **A** | Domain agents & context firewalls | Rename `designer`→`browser`, `fixer`→`ops`; orchestrator prompt firewall rules. |
| **B** | Advisor pattern | `delegate_task` with `run_in_background`; sync delegation path. |
| **C** | Monitor tool | Detached scripts, stdout triggers, `<system-reminder>` wakeups. |
| **D** | System reminders & caching | `SYSTEM_PROMPT_DYNAMIC_BOUNDARY`; hooks use `<system-reminder>` consistently. |
| **E** | Memory & cost | Tiered `CLAUDE.md` hierarchy; cost visibility for large-context sub-agents. |

---

## 🛠️ Usage Examples (Target Flows)

These illustrate the **intended** UX once Phases A–C land; behavior today follows the current tools and background-task model.

### The Monitor Pattern

> "Start the NextJS dev server. Monitor the output, and wake up to fix any TypeScript errors that appear in the logs."

**Target:** the ops-path agent runs the dev server, attaches a Monitor to stdout, and wakes the Orchestrator when a trigger matches — without LLM polling loops.

### The Context Firewall Pattern

> "Check why the login button isn't working on localhost:3000."

**Target:** the Orchestrator delegates to the browser-path agent, which uses Chrome DevTools and returns a short text diagnosis (e.g. a CORS error) so the Orchestrator never ingests a multi-megabyte screenshot.

---

## 🙏 Credits & Upstream

**Po-po-code** is a specialized, heavily opinionated fork of **[oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim)**, which itself descends from **[oh-my-opencode](https://github.com/alvinunreal/oh-my-opencode)** created by Alvin and the Boring Dystopia Development team.

While the upstream project focuses on a broad, highly customizable agent suite with TUI multiplexing, **Po-po-code** strips away generic roles to focus on replicating the tight, autonomous, CLI-native developer experience of Anthropic's Claude Code using context firewalls and the parity roadmap above.

Huge thanks to the original contributors for building the foundation and hook system that makes this architectural direction possible.

---

<p align="center"><i>"To make every token valuable, to make every cache hit, and to make every layer of extension a seamless integration."</i></p>
