# CLAUDE.md

## Project Direction

This fork ("Po-po-code") is implementing the **Claude Code Parity Plan** defined in
[opencode-parity-plan.md](opencode-parity-plan.md). The goal is to bring context firewalls,
synchronous advisor delegation, and event-driven monitoring to the oh-my-opencode-slim
plugin, replicating the architecture leaked from Anthropic's Claude Code CLI.

Key roadmap phases (all checkboxes live in the parity plan):

| Phase | Focus | Status |
| :--- | :--- | :--- |
| **A** | Domain agent renames (`designer`→`browser`, `fixer`→`ops`) + context firewall rules | Not started |
| **B** | Advisor pattern (`delegate_task` with sync mode) | Not started |
| **C** | Monitor tool (detached scripts, `<system-reminder>` wakeups) | Not started |
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

Current agents (pre-parity):

| Agent | File | Role | Parity target |
| :--- | :--- | :--- | :--- |
| `orchestrator` | `orchestrator.ts` | Delegates to sub-agents; answers simple queries directly | *(unchanged)* |
| `designer` | `designer.ts` | UI/frontend specialist | Rename → `browser` (visual QA + chrome-devtools firewall) |
| `fixer` | `fixer.ts` | Bug-fix specialist | Rename → `ops` (builds, logs, bash, monitor) |
| `explorer` | `explorer.ts` | Codebase navigation (Serena LSP, Morph semantic search) | *(unchanged)* |
| `librarian` | `librarian.ts` | Docs/web research (Context7, Linkup, grep.app) | *(unchanged)* |
| `oracle` | `oracle.ts` | Deep reasoning for hard bugs and architecture | *(unchanged)* |
| `council`* | council subsystem | Multi-agent voting (councillor, council-master) | *(unchanged)* |

\* Council agents (`council`, `councillor`, `council-master`) are internal — only `CouncilManager` spawns them.

Phase A renames are **in-place replacements**: the old `designer`/`fixer` keys, prompts,
constants, delegation rules, and config schema entries are removed when `browser`/`ops`
are created. No parallel existence.

- Orchestrator delegates to subagents; fixer/explorer/librarian/oracle are leaf nodes
- Default models defined in `src/config/constants.ts` → `DEFAULT_MODELS`
- Orchestrator model is resolved at runtime via priority fallback (undefined default)
- Delegation rules in `SUBAGENT_DELEGATION_RULES` (same file)

**Config** (`src/config/`)
- Layers: user → project → preset
- `PluginConfig`: `agents`, `tmux`, `disabled_mcps`, `background`, `presets`
- Agent model overrides live in `src/config/constants.ts`
- Config file: `.opencode/oh-my-opencode-slim.jsonc` (project) or `~/.config/opencode/oh-my-opencode-slim.jsonc` (user)

**Tools** (`src/tools/`)
- grep, AST-grep, LSP (diagnostics, references, rename), background task orchestration
- Parity adds: `delegate.ts` (Phase B), `monitor.ts` (Phase C)

**MCP** (`src/mcp/`)
- Built-in: linkup, context7, grep.app
- Per-agent MCP access configured in `src/config/agent-mcps.ts`

**Hooks** (`src/hooks/`)
- Auto-update checker, post-edit LSP nudge
- Parity adds: `<system-reminder>` standardization (Phase D)

**Background tasks** (`src/background/`)
- Fire-and-forget sessions with optional tmux pane visualization
- Phase B deprecates `src/tools/background.ts` in favor of `src/tools/delegate.ts`

## Extension Patterns

- New agent → `src/agents/` + entry in `DEFAULT_MODELS` + `SUBAGENT_NAMES` + `SUBAGENT_DELEGATION_RULES` + `src/config/agent-mcps.ts` + CLI skill permissions
- Rename agent → update all of the above + `ORCHESTRATABLE_AGENTS` + orchestrator prompt + schema + tests + docs
- Remove agent → reverse of "new agent"; grep for the old name across config, tests, prompts, and docs
- New tool → `src/tools/` + export from `src/tools/index.ts` + register in `src/index.ts`
- New MCP → `src/mcp/` + `createBuiltinMcps` + `src/config/agent-mcps.ts`
- New hook → `src/hooks/` + export from `src/hooks/index.ts` + register in `src/index.ts`

## Parity Implementation Checklist (Quick Reference)

When working on any parity phase, consult [opencode-parity-plan.md](opencode-parity-plan.md) for the full task list. Key files touched by each phase:

| Phase | Primary files |
| :--- | :--- |
| A (agent renames) | `src/agents/{designer,fixer}.ts`, `src/config/constants.ts`, `src/config/agent-mcps.ts`, `src/agents/orchestrator.ts` (prompt), `oh-my-opencode-slim.schema.json`, tests |
| B (delegate tool) | `src/tools/background.ts` → `src/tools/delegate.ts`, `src/tools/index.ts`, `src/index.ts` |
| C (monitor tool) | `src/tools/monitor.ts` (new), `src/tools/index.ts`, `src/index.ts` |
| D (system reminders) | `src/hooks/`, agent prompts |
| E (memory + cost) | `src/hooks/`, config layer |
