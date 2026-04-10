import { spawn } from 'node:child_process';
import {
  type PluginInput,
  type ToolDefinition,
  tool,
} from '@opencode-ai/plugin';
import { createInternalAgentTextPart } from '../utils';
import { log } from '../utils/logger';

const z = tool.schema;

// Maximum stdout snippet to include in the alert (characters)
const MAX_SNIPPET_LENGTH = 500;

// Default max lifetime for a monitor process (30 minutes)
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Creates the create_monitor tool for event-driven script polling.
 *
 * Spawns a detached bash process, monitors its stdout, and injects a
 * <system-reminder> alert into the parent session when the trigger condition
 * is matched. This replaces token-burning LLM polling loops.
 */
export function createMonitorTool(
  ctx: PluginInput,
): Record<string, ToolDefinition> {
  const create_monitor = tool({
    description: `Spawn a detached monitor process that watches script output and wakes you up when a condition is met.

Instead of polling in a loop (token-expensive), use this to watch:
- Server startup: script="npm start", trigger_condition="listening on port"
- Build completion: script="npm run build 2>&1", trigger_condition="Build succeeded"
- Log errors: script="tail -f app.log", trigger_condition="ERROR"
- Test pass: script="bun test 2>&1", trigger_condition="All tests passed"

When the trigger_condition appears in stdout, the monitor kills the process and injects a system-reminder into this session to wake you up with the output snippet.

Returns a monitor_id immediately. The monitor runs detached in the background.`,

    args: {
      script: z
        .string()
        .describe(
          'Bash command to run (e.g. "npm start 2>&1", "tail -f /var/log/app.log")',
        ),
      trigger_condition: z
        .string()
        .describe(
          'Substring to watch for in stdout. When found, fires the alert.',
        ),
      event_name: z
        .string()
        .describe(
          'Short name for the event (e.g. "server-ready", "build-failed")',
        ),
      timeout_ms: z
        .number()
        .optional()
        .describe(
          `Max lifetime in ms before the monitor is force-killed. Defaults to ${DEFAULT_TIMEOUT_MS}ms (30 min).`,
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

      const script = String(args.script);
      const triggerCondition = String(args.trigger_condition);
      const eventName = String(args.event_name);
      const timeoutMs =
        typeof args.timeout_ms === 'number'
          ? args.timeout_ms
          : DEFAULT_TIMEOUT_MS;
      const parentSessionId = (toolContext as { sessionID: string }).sessionID;

      const monitorId = `mon_${Math.random().toString(36).substring(2, 10)}`;

      log(`[monitor] spawning: ${monitorId}`, {
        script,
        triggerCondition,
        eventName,
        timeoutMs,
      });

      let stdoutBuffer = '';
      let triggered = false;

      const child = spawn(script, {
        shell: true,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: ctx.directory,
      });

      // Kill the process after timeoutMs if the trigger never fires
      const killTimer = setTimeout(() => {
        if (triggered) return;
        triggered = true;
        try {
          child.kill();
          if (child.pid) process.kill(-child.pid, 'SIGTERM');
        } catch {
          // already exited
        }
        log(`[monitor] timeout: ${monitorId} — killed after ${timeoutMs}ms`);
        ctx.client.session
          .prompt({
            path: { id: parentSessionId },
            body: {
              parts: [
                createInternalAgentTextPart(
                  `<system-reminder> MONITOR ALERT: [${eventName}] ` +
                    `Monitor timed out after ${timeoutMs}ms without matching trigger condition "${triggerCondition}". </system-reminder>`,
                ),
              ],
            },
          })
          .catch(() => {});
      }, timeoutMs);
      // Don't keep Node alive for the timer alone
      killTimer.unref();

      // Unref so the Node process doesn't wait for this child
      child.unref();

      const handleOutput = (chunk: Buffer | string) => {
        if (triggered) return;

        const text = chunk.toString();
        stdoutBuffer += text;

        // Keep buffer bounded
        if (stdoutBuffer.length > MAX_SNIPPET_LENGTH * 4) {
          stdoutBuffer = stdoutBuffer.slice(-MAX_SNIPPET_LENGTH * 2);
        }

        if (stdoutBuffer.includes(triggerCondition)) {
          triggered = true;

          // Kill the child process
          try {
            child.kill();
            // On some systems we need to kill the process group
            if (child.pid) {
              process.kill(-child.pid, 'SIGTERM');
            }
          } catch {
            // Process may have already exited — safe to ignore
          }

          // Extract a snippet around the trigger
          const triggerIndex = stdoutBuffer.lastIndexOf(triggerCondition);
          const snippetStart = Math.max(0, triggerIndex - 200);
          const snippet = stdoutBuffer
            .slice(snippetStart, triggerIndex + MAX_SNIPPET_LENGTH)
            .trim();

          const message =
            `<system-reminder> MONITOR ALERT: [${eventName}] ` +
            `Trigger condition "${triggerCondition}" met.\n` +
            `Output snippet:\n${snippet} </system-reminder>`;

          log(`[monitor] trigger fired: ${monitorId} — ${eventName}`);

          // Inject alert into parent session
          ctx.client.session
            .prompt({
              path: { id: parentSessionId },
              body: {
                parts: [createInternalAgentTextPart(message)],
              },
            })
            .catch((err: unknown) => {
              log(`[monitor] alert injection failed: ${err}`);
            });
        }
      };

      child.stdout?.on('data', handleOutput);
      child.stderr?.on('data', handleOutput);

      child.on('error', (err) => {
        if (triggered) return;
        log(`[monitor] process error: ${monitorId} — ${err.message}`);
      });

      child.on('exit', (code) => {
        if (triggered) return;
        log(`[monitor] process exited without trigger: ${monitorId}`, { code });

        // Notify parent session that the process exited without matching
        ctx.client.session
          .prompt({
            path: { id: parentSessionId },
            body: {
              parts: [
                createInternalAgentTextPart(
                  `<system-reminder> MONITOR ALERT: [${eventName}] ` +
                    `Process exited (code ${code ?? 'unknown'}) without matching trigger condition "${triggerCondition}". </system-reminder>`,
                ),
              ],
            },
          })
          .catch(() => {});
      });

      return `Monitor started.

Monitor ID: ${monitorId}
Script: ${script}
Trigger: "${triggerCondition}"
Event: ${eventName}

Running detached. You will receive a system-reminder when the trigger condition is met or the process exits.`;
    },
  });

  return { create_monitor };
}
