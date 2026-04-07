# OpenCode + oh-my-opencode-slim: Claude Code Parity Plan

**Author:** Tino (with Claude analysis)
**Date:** March 2026
**Target stack:** Python, Rust, TypeScript projects
**Platform:** OpenCode with oh-my-opencode-slim plugin

---

## Executive Summary

This plan addresses three interconnected problems observed during multi-agent orchestration:

1. **Confirmation-bias failure** — the Orchestrator skips exploration when it feels confident
2. **Text-search blindness** — grep/glob misses structural code relationships
3. **Claude Code feature gap** — oh-my-opencode-slim lacks dynamic prompt conditioning, structural code navigation, and project memory

The solution combines **Serena MCP** (structural code understanding), **MorphLLM MCP** (WarpGrep v2 semantic search + FastApply edits), and **oh-my-opencode-slim plugin modifications** (prompt + hook upgrades) into a layered system that narrows the gap with Claude Code.

**Status:** The foundation described in Parts 1–3 is fully implemented. Part 4 identifies remaining gaps and the forward roadmap.

---

# Part 1: Implemented Architecture

Everything in this section is built and shipping in the current codebase.

## 1.1 Tool Integration Layer

### Serena MCP — Structural Code Navigation

**What it solves:** grep only finds what you search for by keyword. Serena exposes LSP-level structural operations (go-to-definition, find-references, call hierarchy) as MCP tools, enabling agents to trace actual execution paths.

**Supported languages:** Python (pylsp/Pyright), Rust (rust-analyzer), TypeScript (typescript-language-server). Serena wraps these via multilspy.

#### Installation

```bash
pip install uv
rustup component add rust-analyzer  # for Rust projects
npm install -g typescript-language-server typescript  # for TS projects

git clone https://github.com/oraios/serena.git ~/tools/serena
```

#### OpenCode MCP Configuration

Add to your project `opencode.json`:

```jsonc
{
  "mcp": {
    "serena": {
      "type": "local",
      "command": ["uv", "run", "--directory", "/path/to/serena", "serena-mcp-server"],
      "enabled": true
    }
  }
}
```

For per-project configuration, create `serena_config.yml` in the project root:

```yaml
project_root: "."
language: "python"  # or "typescript" or "rust"
read_only: true     # safe default for exploration; disable for editing
```

#### Key Serena Tools Available to Agents

| Tool | Purpose | When to use |
|------|---------|-------------|
| `find_symbol` | Locate any function/class/variable by name | Entry point discovery |
| `find_referencing_symbols` | Find all callers of a symbol | Trace who calls what |
| `get_symbols_overview` | Hierarchical structure of a file/module | Architecture overview |
| `search_for_pattern` | Regex search with LSP context | Targeted structural search |

---

### MorphLLM MCP — Semantic Search + Fast Edits

**What it solves:** Two complementary problems:
- **WarpGrep v2** provides AI-powered semantic code search that understands intent ("how does the authentication flow work?") rather than matching keywords. Runs as a parallel sub-agent, keeping the main model's context clean.
- **FastApply** provides fast, accurate file edits using partial code snippets with `// ... existing code ...` markers.

#### OpenCode MCP Configuration

```jsonc
{
  "mcp": {
    "morph-mcp": {
      "type": "local",
      "command": ["npx", "-y", "@morph-labs/morph-mcp"],
      "enabled": true,
      "env": {
        "MORPH_API_KEY": "${MORPH_API_KEY}"
      }
    }
  }
}
```

---

### How the Three Tool Layers Work Together

```
User asks: "How does the batch translation pipeline work?"

Step 1: ORCHESTRATOR classifies as architectural question
        → MUST delegate to @explorer (no self-service allowed)

Step 2: EXPLORER Phase 1 — Broad Discovery (WarpGrep)
        → warpgrep_codebase_search("batch translation pipeline")
        → Returns relevant files across the codebase

Step 3: EXPLORER Phase 2 — Structural Tracing (Serena)
        → find_symbol("SubtitleBatcher")
        → get_call_hierarchy("translate_batch")
        → find_referencing_symbols("ContextHelpers.get_sliding_window")
        → Maps the ACTUAL execution path, not assumed path

Step 4: EXPLORER Phase 3 — Detail Fill (grep/read)
        → Read specific functions identified in Phase 2
        → Grep for config values, constants

Step 5: EXPLORER returns architectural map to ORCHESTRATOR
        → Orchestrator synthesizes answer for user
```

This three-phase workflow makes explicit what Claude Code's Explore sub-agent does implicitly (search → trace → read), preventing the confirmation-bias shortcut.

---

## 1.2 Plugin Modifications

### Explorer Agent — Broad-to-Narrow Search

**File:** `src/agents/explorer.ts` — **Updated**

The Explorer prompt describes a broad-to-narrow approach: start with semantic search (WarpGrep) when scope is uncertain, use Serena for structural tracing (references, definitions, symbol maps), and fall back to grep/ast_grep_search when those tools are unavailable. The three-phase workflow in the diagram above is illustrative; the prompt guides the model to apply tools adaptively rather than rigidly.

### Orchestrator Delegation Hardening

**File:** `src/agents/orchestrator.ts` — **Updated**

The `@explorer` delegation block includes a Tip: for unfamiliar or large codebases, prefer @explorer for "how does X work" questions. The `<Workflow>` section is trimmed to essentials — step-by-step routing rules without verbose explanations Opus already knows.

### Dynamic Phase Reminder Hook

**File:** `src/hooks/phase-reminder/index.ts` — **Removed**

Previously classified user messages and injected context-aware reminders. Removed as redundant — the Explorer and Orchestrator prompts encode the workflow directly.

### Post-WarpGrep Nudge Hook

**File:** `src/hooks/post-warpgrep-nudge/index.ts` — **Removed**

Previously appended a structural tracing nudge after WarpGrep calls. Removed as redundant — the Explorer prompt already encodes the three-phase workflow (WarpGrep → Serena → read).

### Session-Start Project Context Hook

**File:** `src/hooks/project-context/index.ts` — **New**

On the first message of each session, auto-detects and injects project context files (`AGENTS.md`, `codemap.md`) into the prompt. Also injects Serena MCP onboarding check instructions.

### Custom Commands

| Command | Agent | File | Purpose |
|---|---|---|---|
| `/trace` | `@explorer` | `.opencode/commands/trace.md` | Three-phase execution path tracing |
| `/map` | `@orchestrator` | `.opencode/commands/map.md` | Generate/update `codemap.md` project atlas |
| `/review-arch` | `@oracle` | `.opencode/commands/review-arch.md` | Deep architectural review with Serena |

### Additional Hooks

| Hook | File | Purpose |
|---|---|---|
| Delegate-task retry | `src/hooks/delegate-task-retry/` | Guidance when sub-agent delegation fails |
| JSON error recovery | `src/hooks/json-error-recovery/` | Recovery from JSON parse errors in tool output |
| Post-edit nudge | `src/hooks/post-edit-nudge/` | Light mention of lsp_diagnostics after edits |
| Auto-update checker | `src/hooks/auto-update-checker/` | Plugin version checking at session start |

---

## 1.3 Compaction

### Context Compaction (Opencode-DCP)

**Plugin:** `@tarquinen/opencode-dcp` (external, not bundled)

Context compaction is handled by [Opencode-DCP](https://github.com/Opencode-DCP/opencode-dynamic-context-pruning), a mature external plugin providing selective compression, deduplication, and error purging.

**Install:**
```bash
opencode install @tarquinen/opencode-dcp@latest
```

**Key commands:** `/dcp compress`, `/dcp dedupe`, `/dcp purge-errors`

---

## 1.4 Configuration Reference

### opencode.json (project-level)

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["oh-my-opencode-slim"],
  "mcp": {
    "serena": {
      "type": "local",
      "command": ["uv", "run", "--directory", "/path/to/serena", "serena-mcp-server"],
      "enabled": true
    },
    "morph-mcp": {
      "type": "local",
      "command": ["npx", "-y", "@morph-labs/morph-mcp"],
      "enabled": true,
      "env": {
        "MORPH_API_KEY": "${MORPH_API_KEY}"
      }
    }
  }
}
```

### oh-my-opencode-slim.jsonc (plugin config)

```jsonc
{
  "preset": "default",
  "presets": {
    "default": {
      "orchestrator": {
        "mcps": [],
        "skills": ["*"]
      },
      "explorer": {
        "mcps": ["serena", "morph-mcp"]
      },
      "oracle": {
        "mcps": ["serena", "linkup", "context7"]
      },
      "librarian": {
        "mcps": ["linkup", "context7", "grep_app"]
      },
      "fixer": {
        "mcps": ["morph-mcp"]
      },
      "designer": {
        "mcps": []
      }
    }
  }
}
```

### serena_config.yml (per-project)

```yaml
project_root: "."
# language: "python"  # or "typescript" or "rust"
read_only: false
```

### Morph Tool Policy

**File:** `.opencode/rules/morph-policy.md`

Encodes search and edit hierarchies:
- **Search**: WarpGrep (broad semantic) → Serena (structural tracing) → grep/glob (exact keywords)
- **Edit**: FastApply (multi-line) → built-in Edit (single-line) → Write (new files)

---

## 1.5 File Inventory

| File | Status | Description |
|------|--------|-------------|
| `src/agents/explorer.ts` | **Done** | Three-phase workflow with WarpGrep + Serena + grep |
| `src/agents/orchestrator.ts` | **Done** | Trimmed `<Workflow>`, softened delegation tip |
| `src/hooks/phase-reminder/index.ts` | **Removed** | Redundant — prompt encodes workflow directly |
| `src/hooks/post-warpgrep-nudge/index.ts` | **Removed** | Redundant — Explorer prompt encodes three-phase workflow |
| `src/hooks/post-read-nudge/` | **Removed** | Redundant nagging after reads |
| `src/hooks/post-edit-nudge/index.ts` | **Done** | Light lsp_diagnostics mention after edits |
| `src/hooks/project-context/index.ts` | **Done** | Session-start codemap + AGENTS.md injection |
| `src/hooks/delegate-task-retry/` | **Done** | Retry guidance for delegation failures |
| `src/hooks/json-error-recovery/` | **Done** | JSON parse error recovery |
| `src/index.ts` | **Done** | All hooks registered and wired |
| `.opencode/commands/trace.md` | **Done** | /trace workflow command |
| `.opencode/commands/map.md` | **Done** | /map codemap generation command |
| `.opencode/commands/review-arch.md` | **Done** | /review-arch deep review command |
| Opencode-DCP integration | **Done** | Context compaction via `@tarquinen/opencode-dcp` (external plugin, not bundled) |
| `.opencode/rules/morph-policy.md` | **Done** | MorphLLM tool usage policy |

---

# Part 2: What's Implemented vs. Claude Code

## 2.1 Current Parity Assessment

| Capability | Claude Code | oh-my-opencode-slim | Status |
|-----------|-------------|---------------------|--------|
| Structural code tracing | Built-in via model intelligence | Serena MCP (LSP-based, explicit) | **Closed** |
| Semantic code search | Model does inline search | WarpGrep v2 (dedicated sub-agent) | **Closed** |
| Sub-agent isolation | Task tool, fresh context | OpenCode Task tool, same model | **Closed** |
| Parallel sub-agents | Multiple Task agents concurrent | Multiple fixers/explorers parallel | **Closed** |
| Anti-confirmation-bias | "CRITICAL" delegation instruction | Dynamic reminders + WarpGrep + Serena pipeline | **Closed** |
| Fast file edits | Built-in Edit tool | FastApply via MorphLLM MCP | **Closed** |
| Dynamic prompt conditioning | Context-aware prompt fragments | 3 contextual reminder types + nudges | **Partial** — covers the key cases but less granular |
| Project memory (CLAUDE.md) | Auto-generated, persistent, read+write | Session-start read-only injection | **Partial** — read only, no write-back |
| Context compaction | Dedicated summarization | Opencode-DCP (`@tarquinen/opencode-dcp`) | **Closed** — selective compression, deduplication, error purging |
| Model-tier routing | Dynamic per-task (haiku/sonnet/opus) | Static per-agent via presets | **Partial** — no dynamic routing within a session |

## 2.2 Remaining Gaps

These are Claude Code behaviors not yet addressed. Ordered by impact.

### Gap 1: Automatic Edit-Verify Loop

**What Claude Code does:** After editing a file, Claude Code automatically reads the result, runs the linter/type checker, and fixes errors in a tight loop. It doesn't move on until the edit is clean.

**Current state:** The Orchestrator prompt mentions `lsp_diagnostics` in a verify step, but nothing enforces the loop. An agent can edit a file and proceed without checking.

**Possible approach:** A `tool.execute.after` hook that fires after any edit tool (write, FastApply, ast_grep_replace) and auto-invokes `lsp_diagnostics` on the modified file. If errors are found, append them to the output so the agent sees them immediately.

**Complexity:** Medium. Requires tracking which files were modified and feeding diagnostics back into the agent's context.

---

### Gap 2: Automatic Test Execution After Changes

**What Claude Code does:** After making code changes, Claude Code runs relevant tests and iterates on failures — it doesn't declare "done" until tests pass.

**Current state:** No test execution in the workflow. No `/test` command, no post-edit test hook, no test-failure retry mechanism.

**Possible approach:**
- A `/test` custom command that runs the project's test suite (auto-detected from `package.json`, `Cargo.toml`, etc.)
- A post-edit hook that suggests running tests after significant changes
- Test-failure retry loop via the delegate-task-retry pattern

**Complexity:** Medium. Test runner detection is straightforward; the iteration loop requires careful design to avoid infinite retries.

---

### Gap 3: Write-Back Memory / Learning

**What Claude Code does:** `CLAUDE.md` isn't just read at session start — it can be updated mid-session when the user teaches the model project conventions ("always use single quotes", "this project uses X pattern"). Learnings persist across sessions.

**Current state:** The project-context hook reads `AGENTS.md` and `codemap.md` at session start but never writes back. OpenCode doesn't have native persistent memory.

**Possible approach:** A custom tool (`update_project_context`) that appends user-confirmed learnings to `AGENTS.md`. The Orchestrator prompt would include instructions to use this tool when the user explicitly states a project convention or corrects a repeated mistake.

**Complexity:** Low implementation, high design risk. Writing to `AGENTS.md` without user confirmation could corrupt project context. Needs explicit user approval before each write.

---

### Gap 4: Shell Command Error Recovery

**What Claude Code does:** Executes shell commands and, when they fail, reads the error output, diagnoses the problem, and retries with a fix.

**Current state:** The `delegate-task-retry` hook handles delegation failures (when a sub-agent task fails). There's no equivalent for shell command failures within a single agent's execution.

**Possible approach:** A `tool.execute.after` hook for bash/shell tool calls that detects non-zero exit codes and appends diagnostic guidance ("This command failed. Read the error output and fix the issue before proceeding.").

**Complexity:** Low. Similar pattern to existing post-tool hooks.

---

### Gap 5: Frustration / Sentiment Detection

**What Claude Code does:** Auto-detects user frustration from signals beyond explicit corrections — repeated questions, increasingly terse messages, "just do X" patterns — and adjusts its behavior (slows down, asks clarifying questions, escalates).

**Current state:** The `CORRECTION_PATTERNS` regex list catches explicit corrections ("that's wrong", "you missed") but misses subtler signals.

**Possible approach:** Extend the phase-reminder hook's `classifyMessage` function with heuristics:
- Message length shrinking over consecutive turns
- Repeated near-identical questions
- Imperative patterns ("just", "simply", "I already told you")
- Introduce a `FRUSTRATION` message type with a reminder to slow down and re-verify

**Complexity:** Low-medium. The regex approach is straightforward but inherently limited. A reliable frustration detector would need message history analysis, not just single-message classification.

---

### Gap 6: Dynamic Model Routing Per Task Complexity

**What Claude Code does:** Routes to haiku for simple tasks and opus for complex ones within a single session, dynamically based on task complexity.

**Current state:** Model assignment is static per agent via presets. The orchestrator always uses the same model whether the task is "rename this variable" or "redesign the authentication architecture."

**Possible approach:** This would require OpenCode SDK support for runtime model switching. At the plugin level, the closest approximation is having the Orchestrator delegate simple tasks to `@fixer` (which can be configured with a cheaper model) and reserve itself for complex ones — which the current delegation rules already encourage.

**Complexity:** Not addressable at plugin level. Requires OpenCode platform changes.

---

### Gap 7: Graceful MCP Degradation

**What Claude Code does:** All tools are built-in. No external service dependencies.

**Current state:** If WarpGrep's API is down, Explorer fails at Phase 1 with no recovery. If Serena's LSP server crashes mid-session, there's no detection. The Explorer prompt mentions falling back to `ast_grep_search + grep` if Serena is unavailable, but there's no system-level health checking.

**Possible approach:**
- Wrap MCP calls in the hooks layer with timeout/error detection
- On MCP failure, inject a fallback instruction ("Serena is unavailable. Use ast_grep_search and grep for this session.")
- Health check at session start (the Serena onboarding check partially covers this)

**Complexity:** Medium. Needs error boundary design across multiple hook points.

---

### Gap 8: Multi-File Edit Coherence

**What Claude Code does:** Plans multi-file changes holistically — renaming a function in file A automatically includes updating imports in files B, C, D as part of the same operation.

**Current state:** The Fixer agent executes "well-defined tasks" but there's no mechanism ensuring the Orchestrator creates a coherent multi-file plan before dispatching parallel Fixers. Two Fixers editing related files simultaneously could create inconsistencies.

**Possible approach:** The Orchestrator prompt could be extended with a "multi-file change protocol" — when a change affects imports/references across files, the Orchestrator must create a sequential plan rather than dispatching parallel Fixers. The existing `lsp_find_references` tool can identify the scope of impact before dispatching.

**Complexity:** Medium. Prompt engineering + delegation logic changes.

---

### Gap 9: Full Dynamic Prompt Assembly

**What Claude Code does:** Assembles prompts from many context-aware fragments depending on the current state (which tools are available, what the user is doing, what errors have occurred, etc.).

**Current state:** 3 message types (architectural/correction/normal) with nudge hooks. Effective for the key cases but far less granular.

**Possible approach:** Not fully addressable at plugin level. Would require OpenCode SDK support for richer prompt assembly APIs. Incrementally, more hook types and message classifiers can be added as specific failure modes are observed.

**Complexity:** High. Architectural limitation of the plugin model.

---

# Part 3: Forward Roadmap

## Phase A: Edit-Verify Loop (High Impact)
- [ ] Implement post-edit hook that auto-runs `lsp_diagnostics` on modified files
- [ ] Append diagnostics to tool output so agents see errors immediately
- [ ] Test: Edit a file with a type error, verify the agent self-corrects

## Phase B: Test Integration (High Impact)
- [ ] Create `/test` custom command with test runner auto-detection
- [ ] Implement post-edit nudge suggesting test execution after significant changes
- [ ] Design retry limit to prevent infinite test-fix loops

## Phase C: Write-Back Memory (Medium Impact)
- [ ] Create `update_project_context` tool for appending learnings to `AGENTS.md`
- [ ] Add user confirmation gate before any write
- [ ] Update Orchestrator prompt with instructions for when to use it
- [ ] Test: Teach the agent a convention, verify it persists to next session

## Phase D: Shell Error Recovery (Medium Impact)
- [ ] Implement `tool.execute.after` hook for bash/shell tool failures
- [ ] Append diagnostic guidance on non-zero exit codes
- [ ] Test: Run a failing command, verify agent reads error and retries

## Phase E: Expanded Sentiment Detection (Low-Medium Impact)
- [ ] Extend `classifyMessage` with frustration heuristics
- [ ] Add message history analysis (message length trends, repetition)
- [ ] Create `FRUSTRATION` reminder type
- [ ] Test: Simulate increasingly terse messages, verify behavior change

## Phase F: MCP Health Monitoring (Medium Impact)
- [ ] Add MCP call timeout/error detection wrapper
- [ ] Inject fallback instructions on MCP failure
- [ ] Health check Serena and MorphLLM at session start
- [ ] Test: Disable Serena, verify graceful fallback to grep + ast_grep

## Phase G: Multi-File Change Protocol (Medium Impact)
- [ ] Extend Orchestrator prompt with multi-file change protocol
- [ ] Use `lsp_find_references` to assess change scope before dispatching
- [ ] Sequential plan for cross-file changes, parallel only for independent edits
- [ ] Test: Rename a widely-used function, verify all references updated

---

## Appendix: Gaps That Require OpenCode Platform Changes

These cannot be solved at the plugin level:

| Gap | Why it needs platform support |
|-----|-------------------------------|
| Dynamic model routing per task | Plugin can't switch models mid-session; requires SDK API |
| Full dynamic prompt assembly | Plugin hooks cover message transforms but can't replicate Claude Code's granular fragment system |
| Native session memory persistence | Plugin can write to files, but true session memory (surviving compaction, accessible across sessions) needs platform support |
