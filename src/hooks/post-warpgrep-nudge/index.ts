/**
 * Post-WarpGrep nudge — appends a structural tracing reminder after
 * WarpGrep or codebase_search tool calls. Bridges Phase 1 (broad discovery)
 * to Phase 2 (structural tracing via Serena MCP).
 */

const TRACE_NUDGE =
  '\n\n---\nPhase 1 complete. Now trace the structural execution path using Serena MCP tools (find_symbol, get_call_hierarchy, find_referencing_symbols) before reporting results.';

interface ToolExecuteAfterInput {
  tool: string;
  sessionID?: string;
  callID?: string;
}

interface ToolExecuteAfterOutput {
  title: string;
  output: string;
  metadata: Record<string, unknown>;
}

export function createPostWarpgrepNudgeHook() {
  return {
    'tool.execute.after': async (
      input: ToolExecuteAfterInput,
      output: ToolExecuteAfterOutput,
    ): Promise<void> => {
      // Nudge after WarpGrep or broad codebase search calls
      if (
        input.tool.includes('warpgrep') ||
        input.tool.includes('codebase_search')
      ) {
        output.output = output.output + TRACE_NUDGE;
      }
    },
  };
}
