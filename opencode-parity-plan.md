# OpenCode + oh-my-opencode-slim: Claude Code Parity Plan

**Author:** Tino (with Claude analysis)
**Date:** March 2026
**Target stack:** Python, Rust, TypeScript projects
**Platform:** OpenCode with oh-my-opencode-slim plugin

---

## Executive Summary

This plan addresses three interconnected problems identified in the Gemini 3.1 Pro case study:

1. **Confirmation-bias failure** — the Orchestrator skips exploration when it feels confident
2. **Text-search blindness** — the Explorer uses grep/glob only, missing structural code relationships
3. **Claude Code feature gap** — oh-my-opencode-slim lacks dynamic prompt conditioning, structural code navigation, and project memory

The solution combines three tools — **Serena MCP** (structural code understanding), **MorphLLM MCP** (WarpGrep v2 semantic search + FastApply edits), and **oh-my-opencode-slim plugin modifications** (prompt + hook upgrades) — into a layered system that closes the gap with Claude Code without requiring a full rewrite.

---

## Part 1: Tool Integration Layer

### 1.1 Serena MCP — Structural Code Navigation

**What it solves:** The original failure where Gemini couldn't discover SubtitleBatcher.py and ContextHelpers.py because grep only finds what you search for by keyword.

**Why it matters for your stack:** Serena auto-installs language servers for all three of your primary languages:
- **Python** → pylsp (or Pyright)
- **Rust** → rust-analyzer
- **TypeScript** → typescript-language-server

These are the same LSP servers your IDE uses. Serena wraps them via multilspy to expose symbol-level operations as MCP tools.

#### Installation

```bash
# Prerequisites
pip install uv  # if not already installed
rustup component add rust-analyzer  # for Rust projects
npm install -g typescript-language-server typescript  # for TS projects

# Serena itself
git clone https://github.com/oraios/serena.git ~/tools/serena
```

#### OpenCode MCP Configuration

Add to your `opencode.json`:

```jsonc
{
  "mcp": {
    "serena": {
      "type": "local",
      "command": ["uv", "run", "--directory", "/Users/konstantinosfotiou/tools/serena", "serena-mcp-server"],
      "enabled": true
    }
  }
}
```

For per-project configuration, create `serena_config.yml` in each project root:

```yaml
# Python project example
project_root: "."
language: "python"
read_only: true  # safe default for exploration; disable for editing

# Rust project example
# language: "rust"

# TypeScript project example
# language: "typescript"
```

#### Key Serena Tools Available to Agents

| Tool | Purpose | When to use |
|------|---------|-------------|
| `find_symbol` | Locate any function/class/variable by name | Entry point discovery |
| `find_referencing_symbols` | Find all callers of a symbol | Trace who calls what |
| `get_code_map` | Hierarchical structure of a file/module | Architecture overview |
| `get_call_hierarchy` | Full call chain from a symbol | Execution path tracing |
| `search_for_pattern` | Regex search with LSP context | Targeted structural search |

#### Agent MCP Access Configuration

In `oh-my-opencode-slim.jsonc`:

```jsonc
{
  "presets": {
    "default": {
      "orchestrator": {
        "mcps": ["*"]
      },
      "explorer": {
        // Give Explorer access to Serena for structural tracing
        "mcps": ["serena"]
      },
      "oracle": {
        "mcps": ["serena"]
      },
      "librarian": {
        "mcps": ["websearch", "context7", "grep_app"]
      },
      "fixer": {
        "mcps": ["serena"]  // for LSP diagnostics during edits
      },
      "designer": {
        "mcps": []
      }
    }
  }
}
```

---

### 1.2 MorphLLM MCP — Semantic Search + Fast Edits

**What it solves:** Two complementary problems:
- **WarpGrep v2** provides AI-powered semantic code search that understands intent ("how does the authentication flow work?") rather than matching keywords. It runs as a parallel sub-agent, keeping the main model's context clean.
- **FastApply** provides fast, accurate file edits using partial code snippets with `// ... existing code ...` markers, faster than full file rewrites.

#### OpenCode MCP Configuration

Add to your `opencode.json`:

```jsonc
{
  "mcp": {
    "morph-mcp": {
      "type": "local",
      "command": ["npx", "-y", "@anthropic-ai/morph-mcp"],
      "enabled": true,
      "env": {
        "MORPH_API_KEY": "your-morph-api-key"
      }
    }
  }
}
```

#### Tool Policy (from your openc_instr.md, adapted for oh-my-opencode-slim)

Create `.opencode/rules/morph-policy.md`:

```markdown
# Morph MCP Tool Policy

## Search Hierarchy
1. **Broad semantic discovery** → `mcp__morph-mcp__warpgrep_codebase_search`
   - "Find the XYZ flow", "How does XYZ work", "Where is XYZ handled?"
2. **Structural tracing** → Serena tools (`find_symbol`, `get_call_hierarchy`)
   - After WarpGrep identifies relevant files, trace execution paths structurally
3. **Exact keyword lookup** → built-in grep/glob
   - Specific string literals, error messages, config values

## Edit Hierarchy
1. **Multi-line edits** → `mcp__morph-mcp__edit_file` with `// ... existing code ...` markers
2. **Single-line changes** → built-in Edit tool
3. **New files** → built-in Write tool

## Critical Rules
- Always provide a clear first-person `instruction` parameter for FastApply
- Include enough surrounding context (function signatures, unique anchors)
- Omitting `// ... existing code ...` markers DELETES that code
```

#### Agent MCP Access for Morph

Update `oh-my-opencode-slim.jsonc`:

```jsonc
{
  "presets": {
    "default": {
      "orchestrator": {
        "mcps": ["*"]
      },
      "explorer": {
        "mcps": ["serena", "morph-mcp"]  // WarpGrep for discovery + Serena for tracing
      },
      "fixer": {
        "mcps": ["serena", "morph-mcp"]  // FastApply for edits + Serena for diagnostics
      }
    }
  }
}
```

---

### 1.3 How the Three Tool Layers Work Together

```
User asks: "How does the batch translation pipeline work?"

Step 1: ORCHESTRATOR classifies as architectural question
        → MUST delegate to @explorer (no self-service allowed)

Step 2: EXPLORER Phase 1 — Broad Discovery (WarpGrep)
        → warpgrep_codebase_search("batch translation pipeline")
        → Returns: SubtitleTranslator.py, SubtitleBatcher.py,
                   PromptGenerator.py, ContextHelpers.py, TranslationParser.py

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

This three-phase workflow is exactly what Claude Code's Explore sub-agent does implicitly
(search → trace → read), but made explicit to prevent the confirmation-bias shortcut.

---

## Part 2: oh-my-opencode-slim Plugin Modifications

### 2.1 Explorer Agent Rewrite

**File:** `src/agents/explorer.ts`

**Current problem:** Explorer is framed as a "fast contextual grep" specialist with no awareness of LSP or Serena tools.

**Proposed new prompt:**

```typescript
const EXPLORER_PROMPT = `You are Explorer - a codebase navigation and execution tracing specialist.

**Role**: Map execution paths, discover architecture, and locate code. Answer questions like "How does X work?", "Trace the flow from A to B", "Find all usages of Y".

**Tools Available (use in this priority order)**:

### Phase 1: Broad Discovery
- **warpgrep_codebase_search** (Morph MCP): AI semantic code search. Start here for broad questions ("how does X work", "where is Y handled"). Returns relevant files and lines without polluting your context.
- **grep**: Fast regex search for exact strings, error messages, config values.
- **glob**: Find files by name/extension pattern.

### Phase 2: Structural Tracing
- **Serena MCP tools**: Use AFTER Phase 1 to trace actual execution paths.
  - \`find_symbol\`: Locate a function/class/variable definition
  - \`find_referencing_symbols\`: Find all callers/usages of a symbol
  - \`get_call_hierarchy\`: Trace full call chain from a symbol
  - \`get_code_map\`: Get hierarchical structure of a module
  - \`search_for_pattern\`: Regex search with LSP structural context

### Phase 3: Detail Retrieval
- **read**: Read specific files/functions identified in Phase 1-2.
- **ast_grep_search**: AST-aware structural search for code patterns.

**Workflow Rules**:
1. For "how does X work" questions: ALWAYS start with WarpGrep or grep for broad discovery, THEN use Serena to trace the structural execution path. Never stop at grep results alone.
2. For "where is X" questions: grep/glob is sufficient.
3. Fire multiple searches in parallel when possible.
4. Report the ACTUAL architectural flow you traced, not assumptions from file names or log output.

**Anti-Bias Protocol**:
- Do NOT assume architecture from log output, file names, or variable names.
- Do NOT stop after finding files that match your hypothesis. Trace the full path.
- If your initial search confirms a simple pattern, verify it structurally before reporting.

**Output Format**:
<results>
<architecture>
Brief description of the actual execution flow you traced
</architecture>
<files>
- /path/to/file.ts:42 - Role in the flow
</files>
<answer>
Concise answer grounded in structural tracing, not keyword matching
</answer>
</results>

**Constraints**:
- READ-ONLY: Search and report, don't modify
- If Serena MCP is unavailable, fall back to ast_grep_search + grep for structural understanding
- Include line numbers when relevant`;
```

### 2.2 Orchestrator Delegation Hardening

**File:** `src/agents/orchestrator.ts`

Update the `@explorer` section in ORCHESTRATOR_PROMPT:

```typescript
// Replace the existing @explorer block with:
`
@explorer
- Role: Codebase navigation, execution tracing, and architectural mapping specialist
- Capabilities: WarpGrep semantic search, Serena LSP tracing (references/definitions/call hierarchy), glob, grep, AST queries
- **MUST delegate when:** Questions about how code works • Tracing execution paths • Mapping data flow • "Explain this codebase/module/feature" • Any architectural understanding task • Broad discovery across unfamiliar code
- **Delegate when:** Need to discover what exists before planning • Parallel searches speed discovery • Broad/uncertain scope
- **Don't delegate when:** You already have the specific file path AND just need to read its contents • Single known-file lookup
- **CRITICAL RULE:** Never infer architecture from log output, file names, or narrow grep results. If the question is about HOW code works (not WHERE code is), you MUST delegate to @explorer even if you think you know the answer. Explorer uses structural tracing tools you don't have direct access to.
`
```

### 2.3 Dynamic Phase Reminder Hook

**File:** `src/hooks/phase-reminder/index.ts`

Replace the static reminder with a context-aware version:

```typescript
const BASE_REMINDER = `<reminder>Recall Workflow Rules:
Understand → find the best path (delegate based on rules and parallelize independent work) → execute → verify.
If delegating, launch the specialist in the same turn you mention it.</reminder>`;

const ARCHITECTURAL_REMINDER = `<reminder>Recall Workflow Rules:
Understand → find the best path (delegate based on rules and parallelize independent work) → execute → verify.
If delegating, launch the specialist in the same turn you mention it.

ANTI-BIAS PROTOCOL ACTIVE: This query appears to be about code architecture or execution flow.
- You MUST delegate to @explorer for structural tracing.
- Do NOT answer based on file names, log output, or keyword assumptions.
- @explorer will use WarpGrep + Serena LSP to trace the ACTUAL execution path.
- Wait for @explorer's structural map before forming your answer.</reminder>`;

const CORRECTION_REMINDER = `<reminder>Recall Workflow Rules:
Understand → find the best path (delegate based on rules and parallelize independent work) → execute → verify.

CORRECTION DETECTED: The user appears to be correcting or challenging your previous analysis.
- Re-examine your assumptions. Your prior understanding may be incomplete.
- Delegate to @explorer with broader scope to re-trace the execution path.
- If the issue persists after re-exploration, escalate to @oracle for deep architectural review.
- Do NOT defend your previous analysis without fresh structural evidence.</reminder>`;

// Architectural question detection patterns
const ARCHITECTURAL_PATTERNS = [
  /how does .+ work/i,
  /trace .+ (flow|path|execution)/i,
  /explain .+ (architecture|pipeline|system|codebase|module)/i,
  /what happens when/i,
  /walk .+ through/i,
  /data flow/i,
  /execution path/i,
  /can you explain/i,
  /api level/i,
  /under the hood/i,
];

// Correction detection patterns
const CORRECTION_PATTERNS = [
  /that'?s (not|wrong|incorrect)/i,
  /you('re| are) (wrong|missing|incorrect)/i,
  /actually,? (it|the|that)/i,
  /no,? (it|the|that) (doesn'?t|isn'?t|does not)/i,
  /you missed/i,
  /you forgot/i,
  /not how it works/i,
];

function classifyMessage(text: string): 'architectural' | 'correction' | 'normal' {
  for (const pattern of CORRECTION_PATTERNS) {
    if (pattern.test(text)) return 'correction';
  }
  for (const pattern of ARCHITECTURAL_PATTERNS) {
    if (pattern.test(text)) return 'architectural';
  }
  return 'normal';
}

export function createPhaseReminderHook() {
  return {
    'experimental.chat.messages.transform': async (
      _input: Record<string, never>,
      output: { messages: MessageWithParts[] },
    ): Promise<void> => {
      const { messages } = output;
      if (messages.length === 0) return;

      let lastUserMessageIndex = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].info.role === 'user') {
          lastUserMessageIndex = i;
          break;
        }
      }
      if (lastUserMessageIndex === -1) return;

      const lastUserMessage = messages[lastUserMessageIndex];
      const agent = lastUserMessage.info.agent;
      if (agent && agent !== 'orchestrator') return;

      const textPartIndex = lastUserMessage.parts.findIndex(
        (p) => p.type === 'text' && p.text !== undefined,
      );
      if (textPartIndex === -1) return;

      const originalText = lastUserMessage.parts[textPartIndex].text ?? '';
      const messageType = classifyMessage(originalText);

      let reminder: string;
      switch (messageType) {
        case 'architectural':
          reminder = ARCHITECTURAL_REMINDER;
          break;
        case 'correction':
          reminder = CORRECTION_REMINDER;
          break;
        default:
          reminder = BASE_REMINDER;
      }

      lastUserMessage.parts[textPartIndex].text =
        `${reminder}\n\n---\n\n${originalText}`;
    },
  };
}
```

### 2.4 Post-WarpGrep Nudge Hook (New)

**File:** `src/hooks/post-warpgrep-nudge/index.ts`

Create a new hook that fires after WarpGrep searches, reminding the Explorer to trace structurally:

```typescript
const TRACE_NUDGE =
  '\n\n---\nPhase 1 complete. Now trace the structural execution path using Serena MCP tools (find_symbol, get_call_hierarchy, find_referencing_symbols) before reporting results.';

export function createPostWarpgrepNudgeHook() {
  return {
    'tool.execute.after': async (
      input: { tool: string },
      output: { title: string; output: string; metadata: Record<string, unknown> },
    ): Promise<void> => {
      // Nudge after WarpGrep or broad grep searches in explorer context
      if (
        input.tool.includes('warpgrep') ||
        input.tool.includes('codebase_search')
      ) {
        output.output = output.output + TRACE_NUDGE;
      }
    },
  };
}
```

Register in `src/index.ts` alongside the other hooks.

### 2.5 Session-Start Project Context Hook (New)

**File:** `src/hooks/project-context/index.ts`

Auto-detect and inject project codemaps at session start, approximating Claude Code's CLAUDE.md behavior:

```typescript
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CONTEXT_FILES = [
  'codemap.md',
  '.slim/codemap.md',
  'CLAUDE.md',
  '.opencode/context.md',
];

export function createProjectContextHook(projectDir: string) {
  return {
    'experimental.chat.messages.transform': async (
      _input: Record<string, never>,
      output: { messages: Array<{ info: { role: string; agent?: string }; parts: Array<{ type: string; text?: string }> }> },
    ): Promise<void> => {
      const { messages } = output;

      // Only inject on the first user message (session start)
      const userMessages = messages.filter(m => m.info.role === 'user');
      if (userMessages.length !== 1) return;

      // Only inject for orchestrator
      const msg = userMessages[0];
      if (msg.info.agent && msg.info.agent !== 'orchestrator') return;

      // Find and inject project context
      let contextContent = '';
      for (const filename of CONTEXT_FILES) {
        const filepath = join(projectDir, filename);
        if (existsSync(filepath)) {
          try {
            const content = readFileSync(filepath, 'utf-8');
            contextContent += `\n<project_context source="${filename}">\n${content}\n</project_context>\n`;
          } catch {
            // skip unreadable files
          }
        }
      }

      if (!contextContent) return;

      const textPartIndex = msg.parts.findIndex(
        (p) => p.type === 'text' && p.text !== undefined,
      );
      if (textPartIndex === -1) return;

      const originalText = msg.parts[textPartIndex].text ?? '';
      msg.parts[textPartIndex].text =
        `${contextContent}\n\n---\n\n${originalText}`;
    },
  };
}
```

### 2.6 Custom Commands for Common Workflows

Create pre-built commands that encode good patterns, preventing the Orchestrator from taking shortcuts.

#### `/trace` Command

**File:** `.opencode/commands/trace.md`

```markdown
---
description: "Trace an execution path through the codebase using structural analysis"
agent: "explorer"
subtask: true
---

Trace the execution path for: $ARGUMENTS

## Instructions

Use the three-phase workflow:

### Phase 1: Broad Discovery
Use warpgrep_codebase_search to find all files related to this topic.

### Phase 2: Structural Tracing
Use Serena MCP tools to trace the actual execution path:
1. find_symbol to locate entry points
2. get_call_hierarchy to map the call chain
3. find_referencing_symbols to find all consumers

### Phase 3: Detail
Read key functions identified in Phase 2.

Report the ACTUAL execution flow, not assumptions. Include file paths and line numbers.
```

#### `/map` Command

**File:** `.opencode/commands/map.md`

```markdown
---
description: "Generate or update project codemap for architecture documentation"
---

Run the cartography skill to generate/update codemap.md files for this project.

If .slim/cartography.json exists, run change detection and update only affected maps.
If it doesn't exist, initialize and generate full codemaps.

Use multiple parallel @explorer agents to fill in directory-level codemaps.
Then create the root codemap.md as the master atlas.
```

#### `/review-arch` Command

**File:** `.opencode/commands/review-arch.md`

```markdown
---
description: "Deep architectural review using Oracle agent"
agent: "oracle"
subtask: true
---

Perform a deep architectural review of: $ARGUMENTS

First, use Serena MCP to:
1. get_code_map for the relevant modules
2. get_call_hierarchy for key entry points
3. find_referencing_symbols for integration points

Then analyze:
- Design patterns and anti-patterns
- Coupling and cohesion
- Data flow integrity
- Error handling coverage
- Potential scalability concerns

Provide actionable recommendations with specific file:line references.
```

---

## Part 3: Compaction and Long-Context Management

### 3.1 Custom Compaction Hook

Use OpenCode's `experimental.session.compacting` hook to preserve architectural context across compaction boundaries:

**File:** `.opencode/plugins/smart-compaction.ts`

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const SmartCompaction: Plugin = async (ctx) => {
  return {
    "experimental.session.compacting": async (input, output) => {
      output.context.push(`
## Architectural Context Preservation

When summarizing this conversation, preserve:
1. Any codemap or architectural discoveries made by @explorer
2. File paths and their roles in execution flows that were traced
3. Decisions made about delegation (which specialist handled what)
4. Any corrections the user made to the model's understanding
5. The current state of any multi-step implementation plan

Do NOT preserve:
- Full file contents that were read (just note the file path and purpose)
- Intermediate grep/search results (just note what was found)
- Verbose tool outputs (summarize findings)
      `)
    },
  }
}
```

---

## Part 4: Configuration Files Summary

### opencode.json (project-level)

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["oh-my-opencode-slim"],
  "mcp": {
    "serena": {
      "type": "local",
      "command": ["uv", "run", "--directory", "/Users/konstantinosfotiou/tools/serena", "serena-mcp-server"],
      "enabled": true
    },
    "morph-mcp": {
      "type": "local",
      "command": ["npx", "-y", "@anthropic-ai/morph-mcp"],
      "enabled": true,
      "env": {
        "MORPH_API_KEY": "${MORPH_API_KEY}"
      }
    }
  },
  "lsp": {
    "python": { "disabled": false },
    "typescript": { "disabled": false },
    "rust": { "disabled": false }
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
        "mcps": ["*"],
        "skills": ["*"]
      },
      "explorer": {
        "mcps": ["serena", "morph-mcp"]
      },
      "oracle": {
        "mcps": ["serena", "websearch"]
      },
      "librarian": {
        "mcps": ["websearch", "context7", "grep_app"]
      },
      "fixer": {
        "mcps": ["serena", "morph-mcp"]
      },
      "designer": {
        "mcps": []
      }
    }
  }
}
```

### serena_config.yml (per-project, in project root)

```yaml
# Auto-detected for most projects, but explicit config available:
project_root: "."
# language: "python"  # or "typescript" or "rust"
read_only: false
```

---

## Part 5: Implementation Roadmap

### Phase 1: Foundation (Day 1-2)
- [ ] Install Serena MCP and verify it works with a test Python/TS/Rust project
- [ ] Install MorphLLM MCP and verify WarpGrep + FastApply work
- [ ] Configure OpenCode MCP entries in opencode.json
- [ ] Test that both MCPs are accessible from OpenCode agents

### Phase 2: Explorer Upgrade (Day 3-4)
- [ ] Rewrite Explorer prompt in src/agents/explorer.ts (Section 2.1)
- [ ] Update Orchestrator delegation rules in src/agents/orchestrator.ts (Section 2.2)
- [ ] Update MCP access lists in oh-my-opencode-slim.jsonc
- [ ] Test: Ask "How does [X] work?" on a known project — verify Explorer uses WarpGrep → Serena → grep flow

### Phase 3: Hook System (Day 5-6)
- [ ] Implement dynamic phase-reminder hook (Section 2.3)
- [ ] Implement post-WarpGrep nudge hook (Section 2.4)
- [ ] Implement session-start project context hook (Section 2.5)
- [ ] Register all hooks in src/index.ts
- [ ] Test: Verify architectural questions get ARCHITECTURAL_REMINDER injected
- [ ] Test: Verify user corrections get CORRECTION_REMINDER injected

### Phase 4: Commands and Compaction (Day 7)
- [ ] Create /trace, /map, /review-arch commands (Section 2.6)
- [ ] Create smart-compaction plugin (Section 3.1)
- [ ] Create Morph tool policy rules file
- [ ] Run the /map command on a real project to generate initial codemaps

### Phase 5: Validation (Day 8+)
- [ ] Reproduce the original Gemini failure case study on your codebase
- [ ] Verify the upgraded Explorer traces the full pipeline structurally
- [ ] Test correction handling (deliberately give wrong analysis, check escalation)
- [ ] Benchmark: Compare token usage before/after WarpGrep integration
- [ ] Document any edge cases or needed adjustments

---

## Part 6: What This Achieves vs. Claude Code

| Capability | Claude Code | OpenCode + This Plan | Gap |
|-----------|-------------|---------------------|-----|
| Structural code tracing | Built-in via model intelligence | Serena MCP (LSP-based, explicit) | Closed |
| Semantic code search | Model does inline search | WarpGrep v2 (dedicated sub-agent) | Closed (arguably better) |
| Sub-agent isolation | Task tool, fresh context | OpenCode Task tool, same model | Closed |
| Dynamic prompt conditioning | 110+ conditional prompt fragments | 3 contextual reminder types + nudges | Narrowed (80%) |
| Project memory (CLAUDE.md) | Auto-generated, persistent | Session-start context injection + codemaps | Narrowed (70%) |
| Parallel sub-agents | Multiple Task agents concurrent | Multiple fixers/explorers parallel | Closed |
| Anti-confirmation-bias | "CRITICAL" delegation instruction | Dynamic reminders + WarpGrep + Serena pipeline | Closed (arguably better) |
| Fast file edits | Built-in Edit tool | FastApply via MorphLLM MCP | Closed |
| Context compaction | Dedicated summarization agents | Smart compaction plugin | Narrowed (75%) |
| Model-tier routing | haiku/sonnet/opus | Any model per agent via presets | Closed (more flexible) |

### Remaining gaps that can't be closed at plugin level:
- **Full dynamic prompt assembly** (110+ fragments) — would require OpenCode SDK changes
- **Sentiment analysis agent** — Claude Code auto-detects user frustration
- **Session memory persistence** — requires OpenCode platform support
- **CLAUDE.md auto-generation** — partially addressed by cartography skill

---

## Appendix: File Change Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/agents/explorer.ts` | **Rewrite** | Three-phase workflow with WarpGrep + Serena + grep |
| `src/agents/orchestrator.ts` | **Edit** | Harden @explorer delegation rules, add CRITICAL rule |
| `src/hooks/phase-reminder/index.ts` | **Rewrite** | Context-aware dynamic reminders |
| `src/hooks/post-warpgrep-nudge/index.ts` | **New** | Structural tracing nudge after broad search |
| `src/hooks/project-context/index.ts` | **New** | Session-start codemap injection |
| `src/index.ts` | **Edit** | Register new hooks |
| `opencode.json` | **Edit** | Add Serena + MorphLLM MCP entries |
| `oh-my-opencode-slim.jsonc` | **Edit** | Agent MCP access lists |
| `.opencode/commands/trace.md` | **New** | /trace workflow command |
| `.opencode/commands/map.md` | **New** | /map codemap generation command |
| `.opencode/commands/review-arch.md` | **New** | /review-arch deep review command |
| `.opencode/plugins/smart-compaction.ts` | **New** | Context-preserving compaction |
| `.opencode/rules/morph-policy.md` | **New** | MorphLLM tool usage policy |
