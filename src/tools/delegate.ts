import {
  type PluginInput,
  type ToolDefinition,
  tool,
} from '@opencode-ai/plugin';
import type { BackgroundTaskManager } from '../background';
import type { PluginConfig } from '../config';
import { SUBAGENT_NAMES } from '../config';
import type { MultiplexerConfig } from '../config/schema';
import {
  applyAgentVariant,
  createInternalAgentTextPart,
  resolveAgentVariant,
} from '../utils';
import { log } from '../utils/logger';
import {
  extractSessionResult,
  type PromptBody,
  parseModelReference,
  promptWithTimeout,
} from '../utils/session';

const z = tool.schema;

// 5 minutes for synchronous advisor calls
const ADVISOR_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Creates the delegate_task tool — a unified delegation interface that supports
 * both synchronous "advisor" mode and asynchronous fire-and-forget mode.
 *
 * - run_in_background: false → Advisor mode: creates session, awaits result, returns text
 * - run_in_background: true  → Background mode: fire-and-forget via BackgroundTaskManager
 */
export function createDelegateTools(
  ctx: PluginInput,
  manager: BackgroundTaskManager,
  _multiplexerConfig?: MultiplexerConfig,
  config?: PluginConfig,
): Record<string, ToolDefinition> {
  const agentNames = SUBAGENT_NAMES.filter(
    (n) => n !== 'councillor' && n !== 'council-master',
  ).join(', ');

  const delegate_task = tool({
    description: `Delegate a task to a specialist sub-agent.

run_in_background=false (Advisor mode):
- Creates a sub-agent session, awaits completion, and returns the result inline.
- Use for quick consultations where you need the answer before proceeding.
- Blocks until the agent responds (up to 5 minutes).

run_in_background=true (Background mode):
- Fire-and-forget: returns task_id immediately (~1ms).
- The parent session receives an automatic notification when the task completes.
- Use for long-running tasks that don't block the main conversation.

Agents: ${agentNames}`,

    args: {
      description: z
        .string()
        .describe('Short description of the task (5-10 words)'),
      prompt: z.string().describe('The full task prompt for the sub-agent'),
      agent: z.string().describe(`Sub-agent to use: ${agentNames}`),
      run_in_background: z
        .boolean()
        .describe(
          'false = synchronous advisor (blocks, returns result); true = background fire-and-forget',
        ),
    },

    async execute(args, toolContext) {
      if (
        !toolContext ||
        typeof toolContext !== 'object' ||
        !('sessionID' in toolContext)
      ) {
        throw new Error('Invalid toolContext: missing sessionID');
      }

      const agent = String(args.agent);
      const prompt = String(args.prompt);
      const description = String(args.description);
      const runInBackground = Boolean(args.run_in_background);
      const parentSessionId = (toolContext as { sessionID: string }).sessionID;

      // Validate agent against delegation rules
      if (!manager.isAgentAllowed(parentSessionId, agent)) {
        const allowed = manager.getAllowedSubagents(parentSessionId);
        return `Agent '${agent}' is not allowed. Allowed agents: ${allowed.join(', ')}`;
      }

      if (runInBackground) {
        // Fire-and-forget background mode
        const task = manager.launch({
          agent,
          prompt,
          description,
          parentSessionId,
        });
        return `Background task launched.

Task ID: ${task.id}
Agent: ${agent}
Status: ${task.status}

You will receive an automatic notification when the task completes.`;
      }

      // Synchronous advisor mode: create session → prompt → extract → return
      log(`[delegate] advisor mode: ${agent} — ${description}`);

      let sessionId: string | undefined;
      try {
        const session = await ctx.client.session.create({
          body: {
            parentID: parentSessionId,
            title: `Advisor: ${description}`,
          },
          query: { directory: ctx.directory },
        });

        if (!session.data?.id) {
          throw new Error('Failed to create advisor session');
        }

        sessionId = session.data.id;

        const resolvedVariant = resolveAgentVariant(config, agent);
        const baseBody = applyAgentVariant(resolvedVariant, {
          agent,
          parts: [{ type: 'text' as const, text: prompt }],
        } as PromptBody) as unknown as PromptBody;

        // Resolve model override if configured
        const agentConfig = config?.agents?.[agent];
        let model: string | undefined;
        if (agentConfig?.model && typeof agentConfig.model === 'string') {
          model = agentConfig.model;
        } else if (
          Array.isArray(agentConfig?.model) &&
          agentConfig.model.length > 0
        ) {
          const first = agentConfig.model[0];
          model = typeof first === 'string' ? first : first?.id;
        }

        const body: PromptBody = { ...baseBody };
        if (model) {
          const ref = parseModelReference(model);
          if (ref) body.model = ref;
        }

        await promptWithTimeout(
          ctx.client,
          {
            path: { id: sessionId },
            body,
            query: { directory: ctx.directory },
          },
          ADVISOR_TIMEOUT_MS,
        );

        const extraction = await extractSessionResult(ctx.client, sessionId, {
          includeReasoning: false,
        });

        if (extraction.empty) {
          return `[${agent}] returned an empty response.`;
        }

        log(`[delegate] advisor complete: ${agent} — ${description}`);
        const result = `[${agent}]\n\n${extraction.text}`;

        // Clean up the completed session
        await ctx.client.session
          .delete({
            path: { id: sessionId },
            query: { directory: ctx.directory },
          })
          .catch(() => {});
        sessionId = undefined;

        return result;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log(`[delegate] advisor failed: ${agent} — ${msg}`);

        // Attempt to clean up the session
        if (sessionId) {
          ctx.client.session.abort({ path: { id: sessionId } }).catch(() => {});
        }

        return `[${agent}] failed: ${msg}`;
      } finally {
        // Notify parent session that advisor call ended (mirrors background manager behavior)
        if (sessionId) {
          ctx.client.session
            .prompt({
              path: { id: parentSessionId },
              body: {
                parts: [
                  createInternalAgentTextPart(
                    `[Advisor task "${description}" completed]`,
                  ),
                ],
              },
            })
            .catch(() => {});
        }
      }
    },
  });

  return { delegate_task };
}
