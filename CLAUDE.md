# CLAUDE.md

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
- Agents: `orchestrator`, `explorer`, `librarian`, `oracle`, `designer`, `fixer`
- Orchestrator delegates to subagents; fixer/explorer/librarian/oracle are leaf nodes
- Default models defined in `src/config/constants.ts` → `DEFAULT_MODELS`
- Orchestrator model is resolved at runtime via priority fallback (undefined default)

**Config** (`src/config/`)
- Layers: user → project → preset
- `PluginConfig`: `agents`, `tmux`, `disabled_mcps`, `background`, `presets`
- Agent model overrides live in `src/config/constants.ts`

**Tools** (`src/tools/`)
- grep, AST-grep, LSP (diagnostics, references, rename), background task orchestration

**MCP** (`src/mcp/`)
- Built-in: linkup, context7, grep.app
- Per-agent MCP access configured in `src/config/agent-mcps.ts`

**Hooks** (`src/hooks/`)
- Auto-update checker, post-edit LSP nudge

**Background tasks** (`src/background/`)
- Fire-and-forget sessions with optional tmux pane visualization

## Extension Patterns

- New agent → `src/agents/` + entry in `DEFAULT_MODELS` + `src/config/agent-mcps.ts` + CLI skill permissions
- New tool → `src/tools/` + export from `src/tools/index.ts` + register in `src/index.ts`
- New MCP → `src/mcp/` + `createBuiltinMcps` + `src/config/agent-mcps.ts`
- New hook → `src/hooks/` + export from `src/hooks/index.ts` + register in `src/index.ts`
