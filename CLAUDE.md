# CLAUDE.md

## Project Direction

This fork ("Po-po-code") is implementing the **Claude Code Parity Plan** defined in
[opencode-parity-plan.md](opencode-parity-plan.md). The goal is to bring context firewalls,
synchronous advisor delegation, and event-driven monitoring to the oh-my-opencode-slim
plugin, replicating the architecture leaked from Anthropic's Claude Code CLI.

Key roadmap phases (all checkboxes live in the parity plan):

| Phase | Focus | Status |
| :--- | :--- | :--- |
| **A** | Domain agent renames (`designer`→`browser`, `fixer`→`ops`) + context firewall rules | ✅ Complete |
| **B** | Advisor pattern (`delegate_task` with sync mode) | ✅ Complete |
| **C** | Monitor tool (detached scripts, `<system-reminder>` wakeups) | ✅ Complete |
| **D** | Standardize `<system-reminder>` injection + prompt caching boundaries | Not started |
| **E** | Hierarchical memory + sub-agent cost tracking | Not started |

## Build & Dev Commands

```bash
bun run build       # compile src/ → dist/ (ESM + .d.ts)
bun run typecheck   # tsc --noEmit
bun test            # run tests
bun run lint        # biome lint
bun run check       # biome check --write (lint + format + imports)
bun run check:ci    # biome check (no auto-fix, for CI)
bun run dev         # build then launch opencode
```

## Code Style (Biome 2.4.2)

- Single quotes, trailing commas, 2-space indent, 80-char line width, LF endings
- `noExplicitAny`: warn (off in test files)
- Organize imports automatically on save (`biome check --write`)

## Architecture

**Entry points**
- `src/index.ts` — plugin factory (`OhMyOpenCodeLite`); wires agents, tools, MCPs, hooks
- `src/cli/index.ts` — interactive installer CLI

**Agent system** (`src/agents/`)

| Agent | File | Role |
| :--- | :--- | :--- |
| `orchestrator` | `orchestrator.ts` | Delegates to sub-agents; answers simple queries directly. No MCPs (context firewall). |
| `browser` | `browser.ts` | Visual QA + headless browser automation. Holds `chrome-devtools` MCP behind firewall. |
| `ops` | `ops.ts` | Builds, logs, bash, server ops. Execution-focused, no research. |
| `designer` | `designer.ts` | UI/UX specialist. Exclusive owner of `impeccable` design skill suite. |
| `explorer` | `explorer.ts` | Codebase navigation (Serena LSP, Morph semantic search, Context7, grep.app). |
| `oracle` | `oracle.ts` | Deep reasoning for hard bugs, architecture, and code review. |

- Orchestrator delegates to subagents; browser/ops/designer/explorer/oracle are leaf nodes
- Default models defined in `src/config/constants.ts` → `DEFAULT_MODELS`
- Orchestrator model is resolved at runtime via priority fallback (undefined default)
- Delegation rules in `SUBAGENT_DELEGATION_RULES` (same file)

**Config** (`src/config/`)
- Layers: user → project → preset
- `PluginConfig`: `agents`, `tmux`, `disabled_mcps`, `background`, `presets`
- Agent model overrides live in `src/config/constants.ts`
- Config file: `.opencode/po-po-code.jsonc` (project) or `~/.config/opencode/po-po-code.jsonc` (user)

**Tools** (`src/tools/`)
- grep, AST-grep, LSP (diagnostics, references, rename)
- `delegate.ts` — unified `delegate_task` tool (Advisor mode + background delegation)
- `monitor.ts` — `create_monitor` tool (event-driven wakeups via `<system-reminder>`)

**MCP** (`src/mcp/`)
- Built-in: linkup, context7, grep.app
- Per-agent MCP access configured in `src/config/agent-mcps.ts`

**Hooks** (`src/hooks/`)
- Auto-update checker, post-edit LSP nudge
- Parity adds: `<system-reminder>` standardization (Phase D)

**Background tasks** (`src/background/`)
- `BackgroundTaskManager` manages session lifecycle for `delegate_task` (both sync and async)
- Optional tmux pane visualization for background sessions

## Extension Patterns

- New agent → `src/agents/` + entry in `DEFAULT_MODELS` + `SUBAGENT_NAMES` + `SUBAGENT_DELEGATION_RULES` + `src/config/agent-mcps.ts` + CLI skill permissions
- Rename agent → update all of the above + `ORCHESTRATABLE_AGENTS` + orchestrator prompt + schema + tests + docs
- Remove agent → reverse of "new agent"; grep for the old name across config, tests, prompts, and docs
- New tool → `src/tools/` + export from `src/tools/index.ts` + register in `src/index.ts`
- New MCP → `src/mcp/` + `createBuiltinMcps` + `src/config/agent-mcps.ts`
- New hook → `src/hooks/` + export from `src/hooks/index.ts` + register in `src/index.ts`

## Parity Implementation Status

Consult [opencode-parity-plan.md](opencode-parity-plan.md) for the full task list. Remaining phases:

| Phase | Primary files |
| :--- | :--- |
| D (system reminders) | `src/hooks/`, agent prompts |
| E (memory + cost) | `src/hooks/`, config layer |
